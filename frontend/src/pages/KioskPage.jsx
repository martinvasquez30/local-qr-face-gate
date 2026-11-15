import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import Camera from "../components/Camera.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { getDescriptor, loadFaceModels } from "../face/faceModel.js";
import { checkFace } from "../kiosk/kioskApi.js";

const SETTINGS_KEY = "kioskSettings";
const CHECK_EVERY_MS = 1500; // How often the kiosk looks for a face.
const SHOW_RESULT_MS = 3000; // How long a result stays on screen.
const FAILURES_BEFORE_QR = 3; // Denied attempts in a row before suggesting a QR code.

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
 * The screen at the door. Every CHECK_EVERY_MS it looks for exactly one face,
 * sends its 128 numbers to the server and shows the server's decision.
 */
function KioskScreen({ settings, onInvalidKey, onReconfigure }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [isModelReady, setIsModelReady] = useState(false);
  // What the screen says: idle, multiple, granted, denied or error.
  const [message, setMessage] = useState({ kind: "idle" });
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    loadFaceModels()
      .then(() => setIsModelReady(true))
      .catch(() => setMessage({ kind: "error", code: "face_model_failed" }));
  }, []);

  useEffect(() => {
    if (!isModelReady) return undefined;
    let stopped = false;
    // After someone gets in, wait until they leave the camera before checking
    // again, so one person is not logged many times in a row.
    let waitForNextPerson = false;

    async function run() {
      while (!stopped) {
        await wait(CHECK_EVERY_MS);
        if (stopped) return;
        try {
          const { descriptor, error } = await getDescriptor(videoRef.current);
          if (stopped) return;
          if (error) {
            if (error === "no_face") waitForNextPerson = false;
            setMessage({ kind: error === "multiple_faces" ? "multiple" : "idle" });
            continue;
          }
          if (waitForNextPerson) continue;

          const decision = await checkFace(settings.terminalKey, descriptor, settings.direction);
          if (stopped) return;
          const granted = decision.result === "granted";
          setMessage({ kind: decision.result, name: decision.user_name });
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
  }, [isModelReady, settings, onInvalidKey]);

  let text;
  if (!isModelReady && message.kind !== "error") text = t("faceCheck.loadingModel");
  else if (message.kind === "granted") text = t("kiosk.granted", { name: message.name });
  else if (message.kind === "denied") text = t("kiosk.denied");
  else if (message.kind === "multiple") text = t("kiosk.multiple");
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

      {failures >= FAILURES_BEFORE_QR && <p className="notice">{t("kiosk.qrFallback")}</p>}

      <button className="button button--secondary button--small kiosk__setup" type="button" onClick={onReconfigure}>
        {t("kiosk.reconfigure")}
      </button>
    </section>
  );
}

export default KioskPage;
