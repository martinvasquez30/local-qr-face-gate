import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import Camera from "../components/Camera.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { getDescriptor, getHeadTurn, loadFaceModels } from "../face/faceModel.js";
import { hasTurned, isBackToFront, startingTurn } from "../face/headTurn.js";
import { checkFace, checkQr } from "../kiosk/kioskApi.js";
import { readQrFromVideo } from "../kiosk/qrScanner.js";

const SETTINGS_KEY = "kioskSettings";
const CHECK_EVERY_MS = 1500; // How often the kiosk looks for a face.
const SHOW_RESULT_MS = 3000; // How long a result stays on screen.
const FAILURES_BEFORE_QR = 3; // Denied attempts in a row before suggesting a QR code.
const QR_SCAN_EVERY_MS = 300; // How often the picture is searched for a QR code.
const QR_MODE_TIMEOUT_MS = 20000; // Back to face recognition if no code is shown.
const TURN_TIMEOUT_MS = 5000; // Time the person has to turn their head.
const FRONT_TIMEOUT_MS = 3000; // Time to look straight at the camera again.
// Short pause between head measures. Without it the measures run back to back,
// the browser never gets time to draw, and the instructions never appear.
const LIVENESS_PAUSE_MS = 30;

// The kiosk settings (terminal key and entry/exit) stay in this browser, so
// the kiosk is set up only once. Storage access can fail (privacy mode).
function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the settings last until the page is reloaded.
  }
}

function clearSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // Storage blocked: nothing was saved.
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Measure the head turn over and over, adding each value to `values` (oldest
 * first), until `isDone(values)` is true or `timeoutMs` runs out.
 * Returns true if it was done in time.
 */
async function followHead(video, values, isDone, timeoutMs, isStopped) {
  const startedAt = Date.now();
  while (!isStopped() && Date.now() - startedAt < timeoutMs) {
    await wait(LIVENESS_PAUSE_MS);
    const { turn } = await getHeadTurn(video);
    // No face, or more than one, in this picture: skip it.
    if (turn === undefined) continue;
    values.push(turn);
    if (isDone(values)) return true;
  }
  return false;
}

/**
 * Liveness check: ask for a head turn to a random side, then to look straight
 * again. `firstTurn` is the value measured when the face was found.
 * `showStep` puts each instruction on the screen. Returns true if the person
 * turned to the side that was asked.
 */
async function checkLiveness(video, firstTurn, showStep, isStopped) {
  // Random side, so a recorded video cannot know which way to turn.
  const side = Math.random() < 0.5 ? "left" : "right";
  const values = [firstTurn];

  showStep({ kind: "turn", side });
  const turned = await followHead(
    video,
    values,
    () => hasTurned(values, side),
    TURN_TIMEOUT_MS,
    isStopped,
  );
  if (!turned || isStopped()) return false;

  // Back to the front: a turned face matches its enrolled face worse. If the
  // person does not come back in time, the check goes on anyway.
  showStep({ kind: "front" });
  const start = startingTurn(values);
  await followHead(
    video,
    values,
    () => isBackToFront(values[values.length - 1], start),
    FRONT_TIMEOUT_MS,
    isStopped,
  );
  return true;
}

/**
 * The access point (kiosk). It has no user login: it is set up once with the
 * terminal key and whether it is an entry or an exit.
 */
function KioskPage() {
  const [settings, setSettings] = useState(readSettings);
  const [setupError, setSetupError] = useState(null);

  function handleSaved(newSettings) {
    saveSettings(newSettings);
    setSetupError(null);
    setSettings(newSettings);
  }

  // The server rejected the key: go back to the setup screen and say why.
  const handleInvalidKey = useCallback(() => {
    clearSettings();
    setSetupError("invalid_terminal_key");
    setSettings(null);
  }, []);

  function handleReconfigure() {
    clearSettings();
    setSettings(null);
  }

  if (!settings) return <KioskSetup errorCode={setupError} onSaved={handleSaved} />;
  return (
    <KioskScreen
      settings={settings}
      onInvalidKey={handleInvalidKey}
      onReconfigure={handleReconfigure}
    />
  );
}

/** One-time setup: terminal key and direction. */
function KioskSetup({ errorCode, onSaved }) {
  const { t } = useTranslation();
  const [terminalKey, setTerminalKey] = useState("");
  const [direction, setDirection] = useState("in");

  function handleSubmit(event) {
    event.preventDefault();
    if (terminalKey.trim()) onSaved({ terminalKey: terminalKey.trim(), direction });
  }

  return (
    <section className="card">
      <h1 className="title">{t("kiosk.setup.title")}</h1>
      <p className="subtitle">{t("kiosk.setup.subtitle")}</p>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field__label">{t("kiosk.setup.key")}</span>
          <input
            className="field__input"
            type="password"
            autoComplete="off"
            value={terminalKey}
            onChange={(event) => setTerminalKey(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{t("kiosk.setup.direction")}</span>
          <select
            className="field__input"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="in">{t("kiosk.direction.in")}</option>
            <option value="out">{t("kiosk.direction.out")}</option>
          </select>
        </label>
        <ErrorMessage code={errorCode} />
        <button className="button button--primary" type="submit" disabled={!terminalKey.trim()}>
          {t("kiosk.setup.save")}
        </button>
      </form>
    </section>
  );
}

/**
 * The screen at the door. In "face" mode, every CHECK_EVERY_MS it looks for
 * exactly one face, asks the person to turn their head (liveness check), sends
 * the face's 128 numbers to the server and shows the server's decision. In
 * "qr" mode it reads a QR code with the same camera instead.
 */
function KioskScreen({ settings, onInvalidKey, onReconfigure }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [mode, setMode] = useState("face"); // "face" or "qr"
  // What the screen says: idle, turn, front, showQr, multiple, granted, denied or error.
  const [message, setMessage] = useState({ kind: "idle" });
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    loadFaceModels()
      .then(() => setIsModelReady(true))
      .catch(() => setMessage({ kind: "error", code: "face_model_failed" }));
  }, []);

  // Face mode loop.
  useEffect(() => {
    if (!isModelReady || mode !== "face") return undefined;
    let stopped = false;
    // After someone gets in, wait until they leave the camera before checking
    // again, so one person is not logged many times in a row.
    let waitForNextPerson = false;

    async function run() {
      while (!stopped) {
        await wait(CHECK_EVERY_MS);
        if (stopped) return;
        try {
          // 1. Is there exactly one face? (The quick measure, without the descriptor.)
          const { turn, error } = await getHeadTurn(videoRef.current);
          if (stopped) return;
          if (error) {
            if (error === "no_face") waitForNextPerson = false;
            setMessage({ kind: error === "multiple_faces" ? "multiple" : "idle" });
            continue;
          }
          if (waitForNextPerson) continue;

          // 2. Liveness: a head turn to a random side, which a photo cannot do.
          const livenessPassed = await checkLiveness(
            videoRef.current,
            turn,
            setMessage,
            () => stopped,
          );
          if (stopped) return;

          // 3. The descriptor is taken after the turn, when the person looks
          // straight again, so the face that is checked is the one that turned.
          const capture = await getDescriptor(videoRef.current);
          if (stopped) return;
          if (capture.error) {
            // The person left during the check: nothing to log.
            setMessage({ kind: "idle" });
            continue;
          }

          // 4. The server decides, and logs the attempt (also a failed turn).
          const decision = await checkFace(
            settings.terminalKey,
            capture.descriptor,
            settings.direction,
            livenessPassed,
          );
          if (stopped) return;
          const granted = decision.result === "granted";
          setMessage({
            kind: decision.result,
            name: decision.user_name,
            // The kiosk knows this reason itself; the server never says why a face failed.
            reason: livenessPassed ? undefined : "liveness_failed",
          });
          setFailures((count) => (granted ? 0 : count + 1));
          waitForNextPerson = granted;

          await wait(SHOW_RESULT_MS); // Time to read the result.
          if (!stopped) setMessage({ kind: "idle" });
        } catch (error) {
          if (stopped) return;
          const code = errorCodeOf(error);
          if (code === "invalid_terminal_key") {
            onInvalidKey();
            return;
          }
          setMessage({ kind: "error", code });
        }
      }
    }

    run();
    return () => {
      stopped = true;
    };
  }, [isModelReady, mode, settings, onInvalidKey]);

  // QR mode loop: look for a code, check it once, show the result, go back.
  useEffect(() => {
    if (mode !== "qr") return undefined;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const startedAt = Date.now();
    setMessage({ kind: "showQr" });

    async function run() {
      while (!stopped) {
        await wait(QR_SCAN_EVERY_MS);
        if (stopped) return;
        if (Date.now() - startedAt > QR_MODE_TIMEOUT_MS) {
          setMessage({ kind: "idle" });
          setMode("face");
          return;
        }
        const token = readQrFromVideo(videoRef.current, canvas);
        if (!token) continue;

        try {
          const decision = await checkQr(settings.terminalKey, token, settings.direction);
          if (stopped) return;
          setMessage({ kind: decision.result, name: decision.user_name, reason: decision.reason });
          if (decision.result === "granted") setFailures(0);
        } catch (error) {
          if (stopped) return;
          const code = errorCodeOf(error);
          if (code === "invalid_terminal_key") {
            onInvalidKey();
            return;
          }
          setMessage({ kind: "error", code });
        }
        await wait(SHOW_RESULT_MS);
        if (stopped) return;
        setMessage({ kind: "idle" });
        setMode("face");
        return;
      }
    }

    run();
    return () => {
      stopped = true;
    };
  }, [mode, settings, onInvalidKey]);

  let text;
  if (message.kind === "showQr") text = t("kiosk.showQr");
  else if (!isModelReady && message.kind !== "error") text = t("faceCheck.loadingModel");
  else if (message.kind === "granted") text = t("kiosk.granted", { name: message.name });
  else if (message.kind === "denied")
    text = message.reason ? t(`errors.${message.reason}`) : t("kiosk.denied");
  else if (message.kind === "multiple") text = t("kiosk.multiple");
  else if (message.kind === "turn") text = t(`kiosk.turn.${message.side}`);
  else if (message.kind === "front") text = t("kiosk.lookFront");
  else if (message.kind === "error")
    text = t(`errors.${message.code}`, { defaultValue: t("errors.unexpected_error") });
  else text = t("kiosk.idle");

  return (
    <section className="card kiosk">
      <h1 className="title">
        {t("kiosk.title")} · {t(`kiosk.direction.${settings.direction}`)}
      </h1>

      <Camera videoRef={videoRef} />

      <p className={`kiosk__message kiosk__message--${message.kind}`} role="status" aria-live="polite">
        {text}
      </p>

      {mode === "face" && failures >= FAILURES_BEFORE_QR && (
        <p className="notice">{t("kiosk.qrFallback")}</p>
      )}

      <div className="kiosk__actions">
        {mode === "face" ? (
          <button className="button button--primary" type="button" onClick={() => setMode("qr")}>
            {t("kiosk.useQr")}
          </button>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setMessage({ kind: "idle" });
              setMode("face");
            }}
          >
            {t("kiosk.backToFace")}
          </button>
        )}
        <button className="button button--secondary button--small kiosk__setup" type="button" onClick={onReconfigure}>
          {t("kiosk.reconfigure")}
        </button>
      </div>
    </section>
  );
}

export default KioskPage;
