import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext.jsx";
import BackendStatus from "../components/BackendStatus.jsx";

function HomePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <section className="card">
      <h1 className="title">{t("home.welcome", { name: user.name })}</h1>
      <p className="subtitle">{t("home.description")}</p>
      <p className="home__account">
        {t("home.signedInAs", {
          email: user.email,
          role: t(`roles.${user.role}`, { defaultValue: user.role }),
        })}
      </p>

      <BackendStatus />

      <div className="home__actions">
        <button className="button button--secondary" type="button" onClick={logout}>
          {t("home.logout")}
        </button>
      </div>
    </section>
  );
}

export default HomePage;
