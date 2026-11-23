import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext.jsx";
import BackendStatus from "./BackendStatus.jsx";
import Icon from "./Icon.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

/**
 * Bar at the top of every logged-in page: the page name, whether the server
 * answers, and the language.
 * On phones it also has the logout button, because the side menu is hidden.
 */
function TopBar({ title }) {
  const { t } = useTranslation();
  const { logout } = useAuth();

  return (
    <header className="app-topbar d-flex align-items-center gap-3">
      <span className="app-topbar__title flex-grow-1">{title}</span>
      <BackendStatus />
      <LanguageSwitcher />
      <button
        className="icon-button icon-button--outlined d-lg-none"
        type="button"
        onClick={logout}
        aria-label={t("nav.logout")}
        title={t("nav.logout")}
      >
        <Icon name="logout" size={18} />
      </button>
    </header>
  );
}

export default TopBar;
