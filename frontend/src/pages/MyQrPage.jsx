import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import {
  canSignOnThisDevice,
  makePersonalQr,
  readSavedKey,
  requestPersonalQrKey,
  saveKey,
} from "../qr/personalQr.js";

/** True while the browser says it has a network connection. */
function useIsOnline() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return isOnline;
}

/**
 * "My QR": the logged-in user's own QR code, for any role. The key is asked
 * for once, while online; after that the codes are made in this browser, so
 * the page keeps working if the internet goes down.
 */
function MyQrPage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const isOnline = useIsOnline();
  const [key, setKey] = useState(() => readSavedKey(user.id));
  // The current code: its text and the moment its 30-second period ends.
  const [qr, setQr] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [errorCode, setErrorCode] = useState(() =>
    canSignOnThisDevice() ? null : "secure_context_required"
  );

  // No saved key yet: ask the server for one (the only step that needs it).
  useEffect(() => {
    if (key || !canSignOnThisDevice()) return undefined;
    let cancelled = false;
    requestPersonalQrKey(token)
      .then((data) => {
        if (cancelled) return;
        saveKey(user.id, data.key);
        setKey(data.key);
      })
      .catch((error) => {
        if (!cancelled) setErrorCode(errorCodeOf(error));
      });
    return () => {
      cancelled = true;
    };
  }, [key, token, user.id]);

  // Make a new code with the key and the clock. No network involved.
  const makeCode = useCallback(async () => {
    if (!key) return;
    try {
      const code = await makePersonalQr(key, user.id);
      setQr(code);
      setSecondsLeft(Math.ceil((code.expiresAt - Date.now()) / 1000));
      setErrorCode(null);
    } catch {
      setErrorCode("unexpected_error");
    }
  }, [key, user.id]);

  useEffect(() => {
    makeCode();
  }, [makeCode]);

  // Countdown. When the 30-second period ends, make the next code.
  useEffect(() => {
    if (!qr) return undefined;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        makeCode();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [qr, makeCode]);

  return (
    <section className="card">
      <h1 className="title">{t("myQr.title")}</h1>
      <p className="subtitle">
        {user.name} · {user.email}
      </p>

      <p className={`connection ${isOnline ? "connection--online" : "connection--offline"}`} role="status">
        {isOnline ? t("myQr.online") : t("myQr.offline")}
      </p>

      <ErrorMessage code={errorCode} />
      {!key && errorCode === "network_error" && <p className="notice">{t("myQr.needsConnection")}</p>}

      {qr && (
        <div className="qr">
          {/* The QR contains "P:<user_id>:<period>:<nonce>:<signature>". */}
          <QRCodeSVG className="qr__code" value={qr.value} size={256} title={t("myQr.title")} />
          <p className="qr__timer">{t("myQr.changesIn", { seconds: secondsLeft })}</p>
          <p className="notice">{t("myQr.help")}</p>
          <button className="button button--secondary" type="button" onClick={makeCode}>
            {t("myQr.newCode")}
          </button>
        </div>
      )}
    </section>
  );
}

export default MyQrPage;
