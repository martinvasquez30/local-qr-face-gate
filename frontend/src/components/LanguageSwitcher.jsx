import { useTranslation } from "react-i18next";
import { LANGUAGE_NAMES, saveLanguage } from "../i18n.js";

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  function handleChange(event) {
    const language = event.target.value;
    i18n.changeLanguage(language);
    saveLanguage(language);
  }

  return (
    <label className="language-switcher">
      {/* Hidden visually but read by screen readers. */}
      <span className="visually-hidden">{t("language.label")}</span>
      <select
        className="language-switcher__select"
        value={i18n.resolvedLanguage}
        onChange={handleChange}
      >
        {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default LanguageSwitcher;
