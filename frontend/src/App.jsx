import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext.jsx";
import LanguageSwitcher from "./components/LanguageSwitcher.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

function App() {
  const { t } = useTranslation();
  const { user, isRestoring } = useAuth();

  // Pick the screen from the session state.
  let content;
  if (isRestoring) {
    content = (
      <p className="loading" role="status">
        {t("app.loading")}
      </p>
    );
  } else if (user) {
    content = <HomePage />;
  } else {
    content = <LoginPage />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">{t("app.title")}</span>
        <LanguageSwitcher />
      </header>
      <main className="page">{content}</main>
    </div>
  );
}

export default App;
