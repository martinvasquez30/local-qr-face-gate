import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";

function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
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
      setErrorCode(error instanceof ApiError ? error.code : "unexpected_error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card">
      <h1 className="title">{t("login.title")}</h1>
      <p className="subtitle">{t("login.subtitle")}</p>

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

        {errorCode && (
          <p className="form__error" role="alert">
            {t(`errors.${errorCode}`, { defaultValue: t("errors.unexpected_error") })}
          </p>
        )}

        <button className="button button--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>

      <p className="notice">{t("login.temporaryNotice")}</p>
    </section>
  );
}

export default LoginPage;
