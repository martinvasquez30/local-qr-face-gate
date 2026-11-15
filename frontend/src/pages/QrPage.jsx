import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { createQr, getUser } from "../users/usersApi.js";

/**
 * Shows a temporary QR code for one user. It is "dynamic": when it expires,
 * a new one is created automatically. Each code works only once.
 */
function QrPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  // The current code: its text and the moment it stops working.
  const [qr, setQr] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [errorCode, setErrorCode] = useState(null);

  const issueQr = useCallback(async () => {
    try {
      const data = await createQr(token, userId);
      setQr({ value: data.token, expiresAt: Date.now() + data.expires_in * 1000 });
      setSecondsLeft(data.expires_in);
      setErrorCode(null);
    } catch (error) {
      setQr(null);
      setErrorCode(errorCodeOf(error));
    }
  }, [token, userId]);

  useEffect(() => {
    getUser(token, userId)
      .then(setUser)
      .catch((error) => setErrorCode(errorCodeOf(error)));
    issueQr();
  }, [token, userId, issueQr]);

  // Countdown. When it reaches 0, ask the server for a new code.
  useEffect(() => {
    if (!qr) return undefined;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        issueQr();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [qr, issueQr]);

  return (
    <section className="card">
      <Link className="back-link" to="/users">
        {t("enroll.back")}
      </Link>
      <h1 className="title">{t("qr.title")}</h1>
      {user && (
        <p className="subtitle">
          {user.name} · {user.email}
        </p>
      )}

      <ErrorMessage code={errorCode} />

      {qr && (
        <div className="qr">
          {/* The QR only contains the signed token text. */}
          <QRCodeSVG className="qr__code" value={qr.value} size={256} title={t("qr.title")} />
          <p className="qr__timer" role="status">
            {t("qr.expiresIn", { seconds: secondsLeft })}
          </p>
          <p className="notice">{t("qr.help")}</p>
          <button className="button button--secondary" type="button" onClick={issueQr}>
            {t("qr.renew")}
          </button>
        </div>
      )}
    </section>
  );
}

export default QrPage;
