import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Camera from "../components/Camera.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { getDescriptor, getHeadTurn, loadFaceModels } from "../face/faceModel.js";
import { TURN_NEEDED, turnSide } from "../face/headTurn.js";

// Same pause as the kiosk between head measures, so the numbers here match
// what the kiosk sees.
const TURN_PAUSE_MS = 30;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks that the camera and the face model work: it computes one descriptor
 * and shows how many numbers it has and how long it took. The head-turn test
 * shows the turn value live (and the most it reached to each side), to check
 * the liveness check with a real camera. Nothing is saved.
 */
function FaceCheckPage() {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [result, setResult] = useState(null);
  const [isTurnTest, setIsTurnTest] = useState(false);
  const [turnStats, setTurnStats] = useState(null);

  useEffect(() => {
    loadFaceModels()
      .then(() => setIsModelReady(true))
      .catch(() => setErrorCode("face_model_failed"));
  }, []);

  // Head-turn test loop: measure the head again and again while it is on.
  useEffect(() => {
    if (!isTurnTest) return undefined;
    let stopped = false;

    async function run() {
      let mostLeft = 0; // The highest value seen (turns to the left are positive).
      let mostRight = 0; // The lowest value seen (turns to the right are negative).
      let measuredAt = []; // When each measure finished, to count measures per second.
      while (!stopped) {
        await wait(TURN_PAUSE_MS);
        const { turn } = await getHeadTurn(videoRef.current);
        if (stopped) return;

        const now = performance.now();
        measuredAt = [...measuredAt, now].filter((time) => now - time < 1000);
        if (turn === undefined) {
          setTurnStats((stats) => ({ ...stats, current: null, rate: measuredAt.length }));
          continue;
        }
        mostLeft = Math.max(mostLeft, turn);
        mostRight = Math.min(mostRight, turn);
        setTurnStats({ current: turn, mostLeft, mostRight, rate: measuredAt.length });
      }
    }

    setTurnStats(null);
    run();
    return () => {
      stopped = true;
    };
  }, [isTurnTest]);

  async function handleCheck() {
    setIsChecking(true);
    setErrorCode(null);
    setResult(null);
    const startedAt = performance.now();
    try {
      const { descriptor, error } = await getDescriptor(videoRef.current);
      if (error) {
        setErrorCode(error);
      } else {
        setResult({
          length: descriptor.length,
          ms: Math.round(performance.now() - startedAt),
          preview: descriptor.slice(0, 3).map((value) => value.toFixed(3)).join(", "),
        });
      }
    } catch {
      setErrorCode("face_model_failed");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="card">
      <h1 className="title">{t("faceCheck.title")}</h1>
      <p className="subtitle">{t("faceCheck.subtitle")}</p>

      <Camera videoRef={videoRef} />

      <div className="form face-check__actions">
        <ErrorMessage code={errorCode} />
        {result && (
          <p className="form__success" role="status">
            {t("faceCheck.result", result)}
          </p>
        )}
        <button
          className="button button--primary"
          type="button"
          disabled={!isModelReady || isChecking || isTurnTest}
          onClick={handleCheck}
        >
          {!isModelReady
            ? t("faceCheck.loadingModel")
            : isChecking
              ? t("faceCheck.checking")
              : t("faceCheck.check")}
        </button>

        {isTurnTest && (
          <div className="notice" role="status">
            {t("faceCheck.turnHelp", { needed: TURN_NEEDED })}
            {turnStats && (
              <p className="face-check__stats">
                {t("faceCheck.turnStats", {
                  current: turnStats.current?.toFixed(2) ?? "—",
                  side:
                    turnStats.current == null
                      ? "—"
                      : t(`faceCheck.side.${turnSide(turnStats.current)}`),
                  mostLeft: (turnStats.mostLeft ?? 0).toFixed(2),
                  mostRight: (turnStats.mostRight ?? 0).toFixed(2),
                  rate: turnStats.rate,
                })}
              </p>
            )}
          </div>
        )}
        <button
          className="button button--secondary"
          type="button"
          disabled={!isModelReady || isChecking}
          onClick={() => setIsTurnTest((on) => !on)}
        >
          {isTurnTest ? t("faceCheck.turnStop") : t("faceCheck.turnStart")}
        </button>
      </div>
    </section>
  );
}

export default FaceCheckPage;
