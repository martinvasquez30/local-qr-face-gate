import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Camera from "../components/Camera.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { getDescriptor, loadFaceModels } from "../face/faceModel.js";
import { deleteFace, enrollFace, getFaceStatus, getUser } from "../users/usersApi.js";

// Several captures with small changes (angle, light) give a more stable face.
const REQUIRED_CAPTURES = 3;

/**
 * Enroll the face of one user. The camera only turns on after consent. Each
 * capture becomes 128 numbers in the browser; only those numbers are sent to
 * the server, which stores their average. No photo is kept.
 */
function EnrollFacePage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const { userId } = useParams();
  const videoRef = useRef(null);

  const [user, setUser] = useState(null);
  const [faceStatus, setFaceStatus] = useState(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [captures, setCaptures] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [savedMessage, setSavedMessage] = useState(false);

  // Load the user and whether they already have a face.
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([getUser(token, userId, options), getFaceStatus(token, userId, options)])
      .then(([loadedUser, status]) => {
        setUser(loadedUser);
        setFaceStatus(status);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setErrorCode(errorCodeOf(error));
      });
    return () => controller.abort();
  }, [token, userId]);

  // Start loading the face model as soon as there is consent.
  useEffect(() => {
    if (!hasConsent) return;
    loadFaceModels()
      .then(() => setIsModelReady(true))
      .catch(() => setErrorCode("face_model_failed"));
  }, [hasConsent]);

  async function handleCapture() {
    setIsBusy(true);
    setErrorCode(null);
    setSavedMessage(false);
    try {
      const { descriptor, error } = await getDescriptor(videoRef.current);
      if (error) setErrorCode(error);
      else setCaptures((current) => [...current, descriptor]);
    } catch {
      setErrorCode("face_model_failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSave() {
    setIsBusy(true);
    setErrorCode(null);
    try {
      setFaceStatus(await enrollFace(token, userId, captures));
      setCaptures([]);
      setSavedMessage(true);
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("enroll.confirmDelete"))) return;
    setIsBusy(true);
    setErrorCode(null);
    setSavedMessage(false);
    try {
      await deleteFace(token, userId);
      setFaceStatus({ enrolled: false, updated_at: null });
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    } finally {
      setIsBusy(false);
    }
  }

  const isLoaded = user !== null && faceStatus !== null;
  const canCapture = isModelReady && !isBusy && captures.length < REQUIRED_CAPTURES;

  return (
    <section className="card">
      <Link className="back-link" to="/users">
        {t("enroll.back")}
      </Link>
      <h1 className="title">{t("enroll.title")}</h1>

      {!isLoaded ? (
        <>
          <ErrorMessage code={errorCode} />
          {!errorCode && (
            <p className="loading" role="status">
              {t("app.loading")}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="subtitle">
            {user.name} · {user.email}
          </p>

          <p className="enroll__status" role="status">
            {faceStatus.enrolled
              ? t("enroll.enrolledSince", {
                  date: new Date(faceStatus.updated_at).toLocaleString(i18n.language),
                })
              : t("enroll.notEnrolled")}
          </p>

          {!user.is_active ? (
            <ErrorMessage code="user_inactive" />
          ) : (
            <div className="form">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={hasConsent}
                  onChange={(event) => setHasConsent(event.target.checked)}
                />
                <span>{t("enroll.consent")}</span>
              </label>

              {/* The camera is only turned on after consent. */}
              {hasConsent && <Camera videoRef={videoRef} />}

              <ErrorMessage code={errorCode} />
              {savedMessage && (
                <p className="form__success" role="status">
                  {t("enroll.saved")}
                </p>
              )}

              {hasConsent && (
                <div className="enroll__actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={!canCapture}
                    onClick={handleCapture}
                  >
                    {isModelReady
                      ? t("enroll.capture", { count: captures.length, total: REQUIRED_CAPTURES })
                      : t("faceCheck.loadingModel")}
                  </button>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={isBusy || captures.length < REQUIRED_CAPTURES}
                    onClick={handleSave}
                  >
                    {t("enroll.save")}
                  </button>
                  {captures.length > 0 && (
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => setCaptures([])}
                    >
                      {t("enroll.restart")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {faceStatus.enrolled && (
            <button
              className="button button--secondary enroll__delete"
              type="button"
              disabled={isBusy}
              onClick={handleDelete}
            >
              {t("enroll.delete")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default EnrollFacePage;
