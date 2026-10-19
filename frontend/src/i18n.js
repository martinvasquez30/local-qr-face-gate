import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

// Each language is shown in its own name ("Español", "English"), so people can
// find their language even when they do not understand the current one. That
// is why these names are not translated.
export const LANGUAGE_NAMES = {
  es: "Español",
  en: "English",
};

const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_NAMES);
const DEFAULT_LANGUAGE = "es";
const STORAGE_KEY = "language";

function readSavedLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Storage blocked (e.g. private mode): ignore the saved choice.
  }
}

export function saveLanguage(language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage blocked: the choice only lasts until the page is reloaded.
  }
}

// First browser language we support, e.g. "en-US" -> "en".
function detectBrowserLanguage() {
  const browserLanguages = navigator.languages ?? [navigator.language];
  for (const tag of browserLanguages) {
    const language = tag?.split("-")[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(language)) return language;
  }
  return null;
}

// Priority: saved choice -> browser language -> Spanish.
function pickInitialLanguage() {
  const saved = readSavedLanguage();
  if (SUPPORTED_LANGUAGES.includes(saved)) return saved;
  return detectBrowserLanguage() ?? DEFAULT_LANGUAGE;
}

// Keep the <html lang> attribute and the tab title in the current language,
// so screen readers and the browser treat the page correctly.
function updateDocument(language) {
  document.documentElement.lang = language;
  document.title = i18n.t("app.title");
}

// The translations are bundled (no network), so init finishes synchronously.
i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: pickInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: {
    escapeValue: false, // React already escapes values when rendering.
  },
});

updateDocument(i18n.language);
i18n.on("languageChanged", updateDocument);

export default i18n;
