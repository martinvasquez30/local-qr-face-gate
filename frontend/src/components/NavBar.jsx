import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

/** Links between pages. Members only see "Home" and "My QR". */
function NavBar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const isAdmin = user.role === "admin";

  // NavLink adds the "active" class to the link of the current page.
  return (
    <nav className="topbar__nav" aria-label={t("nav.label")}>
      <NavLink className="nav-link" to="/" end>
        {t("nav.home")}
      </NavLink>
      <NavLink className="nav-link" to="/my-qr">
        {t("nav.myQr")}
      </NavLink>
      {isAdmin && (
        <>
          <NavLink className="nav-link" to="/users">
            {t("nav.users")}
          </NavLink>
          <NavLink className="nav-link" to="/history">
            {t("nav.history")}
          </NavLink>
          <NavLink className="nav-link" to="/kiosk">
            {t("nav.kiosk")}
          </NavLink>
        </>
      )}
    </nav>
  );
}

export default NavBar;
