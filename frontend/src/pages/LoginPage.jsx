import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { API_BASE_URL, SSO_PROVIDER_NAME } from "../config.js";

function LoginPage() {
  const { t } = useTranslation();
  const { login, ssoError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The error code is stored, not the message, so the message is translated
  // when rendering and follows language changes.
  const [errorCode, setErrorCode] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setErrorCode("missing_fields");
      return;
    }

    setErrorCode(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card">
      <h1 className="title">{t("login.title")}</h1>
      <p className="subtitle">{t("login.subtitle")}</p>

      <div className="sso">
        {/* A normal link, not an API call: the whole page goes to the provider
            and the backend sends it back here with "#token=..." or "#error=...". */}
        <a className="button button--primary button--block" href={`${API_BASE_URL}/auth/sso/login`}>
          {t("login.sso", { provider: SSO_PROVIDER_NAME })}
        </a>
        <ErrorMessage code={ssoError} />
      </div>

      <p className="divider">{t("login.devAccess")}</p>

      {/* noValidate: we show our own translated messages instead of the
          browser's built-in ones, which use the browser's language. */}
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field__label">{t("login.email")}</span>
          <input
            className="field__input"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">{t("login.password")}</span>
          <input
            className="field__input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <ErrorMessage code={errorCode} />

        <button className="button button--secondary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>

      <p className="notice">{t("login.temporaryNotice")}</p>
    </section>
  );
}

export default LoginPage;
