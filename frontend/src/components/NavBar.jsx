import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

/** Links between pages. Only shown to logged-in admins. */
function NavBar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (user?.role !== "admin") return null;

  // NavLink adds the "active" class to the link of the current page.
  return (
    <nav className="topbar__nav" aria-label={t("nav.label")}>
      <NavLink className="nav-link" to="/" end>
        {t("nav.home")}
      </NavLink>
      <NavLink className="nav-link" to="/users">
        {t("nav.users")}
      </NavLink>
    </nav>
  );
}

export default NavBar;
