import { useTranslation } from "react-i18next";

/**
 * Shows the translated message for an error code from the API (or our own
 * codes such as "missing_fields"). Unknown codes fall back to a generic text.
 */
function ErrorMessage({ code }) {
  const { t } = useTranslation();
  if (!code) return null;

  return (
    <p className="form__error" role="alert">
      {t(`errors.${code}`, { defaultValue: t("errors.unexpected_error") })}
    </p>
  );
}

export default ErrorMessage;
