import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import LanguageSwitcher from "./components/LanguageSwitcher.jsx";
import NavBar from "./components/NavBar.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";

function App() {
  const { t } = useTranslation();
  const { user, isRestoring } = useAuth();
  const isAdmin = user?.role === "admin";

  // Pick the screen from the session state. While logged out, every URL shows
  // the login form; after logging in, the same URL shows its page.
  let content;
  if (isRestoring) {
    content = (
      <p className="loading" role="status">
        {t("app.loading")}
      </p>
    );
  } else if (!user) {
    content = <LoginPage />;
  } else {
    content = (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/users" element={isAdmin ? <UsersPage /> : <Navigate to="/" replace />} />
        {/* Unknown URLs go back to the home page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">{t("app.title")}</span>
        <NavBar />
        <LanguageSwitcher />
      </header>
      <main className="page">{content}</main>
    </div>
  );
}

export default App;
