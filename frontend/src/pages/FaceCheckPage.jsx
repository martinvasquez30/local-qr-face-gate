import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Camera from "../components/Camera.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { getDescriptor, loadFaceModels } from "../face/faceModel.js";

/**
 * Checks that the camera and the face model work: it computes one descriptor
 * and shows how many numbers it has and how long it took. Nothing is saved.
 */
function FaceCheckPage() {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadFaceModels()
      .then(() => setIsModelReady(true))
      .catch(() => setErrorCode("face_model_failed"));
  }, []);

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
          disabled={!isModelReady || isChecking}
          onClick={handleCheck}
        >
          {!isModelReady
            ? t("faceCheck.loadingModel")
            : isChecking
              ? t("faceCheck.checking")
              : t("faceCheck.check")}
        </button>
      </div>
    </section>
  );
}

export default FaceCheckPage;
