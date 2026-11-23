import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import AppShell from "./components/AppShell.jsx";
import PublicLayout from "./components/PublicLayout.jsx";
import { FACE_RECOGNITION_ENABLED } from "./config.js";
import EnrollFacePage from "./pages/EnrollFacePage.jsx";
import FaceCheckPage from "./pages/FaceCheckPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import IssueQrPage from "./pages/IssueQrPage.jsx";
import KioskPage from "./pages/KioskPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MyQrPage from "./pages/MyQrPage.jsx";
import QrPage from "./pages/QrPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";

function App() {
  const { t } = useTranslation();
  const { user, isRestoring } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "admin";
  // The face pages only exist where face recognition is on (not in the online demo).
  const canUseFaces = isAdmin && FACE_RECOGNITION_ENABLED;

  // Pick the screen from the session state. While logged out, every URL shows
  // the login form; after logging in, the same URL shows its page. The kiosk
  // is the exception: it uses a terminal key instead of a user login.
  // Screens without a user (kiosk, loading, login) have no menu.
  if (pathname === "/kiosk") {
    return (
      <PublicLayout>
        <KioskPage />
      </PublicLayout>
    );
  }
  if (isRestoring) {
    return (
      <PublicLayout>
        <p className="loading" role="status">
          {t("app.loading")}
        </p>
      </PublicLayout>
    );
  }
  if (!user) {
    return (
      <PublicLayout>
        <LoginPage />
      </PublicLayout>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Every logged-in user, members too: their own QR code. */}
        <Route path="/my-qr" element={<MyQrPage />} />
        <Route path="/users" element={isAdmin ? <UsersPage /> : <Navigate to="/" replace />} />
        <Route
          path="/users/:userId/face"
          element={canUseFaces ? <EnrollFacePage /> : <Navigate to="/" replace />}
        />
        <Route path="/history" element={isAdmin ? <HistoryPage /> : <Navigate to="/" replace />} />
        <Route path="/qr" element={isAdmin ? <IssueQrPage /> : <Navigate to="/" replace />} />
        <Route
          path="/users/:userId/qr"
          element={isAdmin ? <QrPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/face-check"
          element={canUseFaces ? <FaceCheckPage /> : <Navigate to="/" replace />}
        />
        {/* Unknown URLs go back to the home page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
