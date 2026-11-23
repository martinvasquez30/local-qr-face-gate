import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "../components/Icon.jsx";
import { FACE_RECOGNITION_ENABLED } from "../config.js";
import AdminDashboard from "../dashboard/AdminDashboard.jsx";

/** Home: a greeting, and for admins today's summary. */
function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user.role === "admin";

  return (
    <div className="page-wide">
      <div className="page-intro">
        <div>
          <h1 className="title">{t("home.welcome", { name: user.name })}</h1>
          <p className="subtitle">
            {t("home.signedInAs", {
              email: user.email,
              role: t(`roles.${user.role}`, { defaultValue: user.role }),
            })}
          </p>
        </div>
        {/* The main action of each role, always in the same place. */}
        <Link className="button button--primary button--icon" to={isAdmin ? "/qr" : "/my-qr"}>
          <Icon name="qr" size={18} />
          {isAdmin ? t("home.issueQr") : t("home.myQr")}
        </Link>
      </div>

      {!FACE_RECOGNITION_ENABLED && <p className="notice mb-3">{t("home.onlineDemo")}</p>}

      {isAdmin ? (
        <AdminDashboard />
      ) : (
        <p className="panel panel--padded">{t("home.description")}</p>
      )}
    </div>
  );
}

export default HomePage;
