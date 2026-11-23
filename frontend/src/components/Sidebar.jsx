import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Brand from "./Brand.jsx";
import Icon from "./Icon.jsx";

// "Ana Martínez" -> "AM", "admin" -> "A".
function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Side menu for large screens. Bootstrap hides it below the "lg" breakpoint
 * (d-none d-lg-flex); there the bottom bar (BottomNav) takes its place.
 */
function Sidebar({ items }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <aside className="app-sidebar d-none d-lg-flex flex-column">
      <Brand className="brand--on-dark" />

      <nav className="app-sidebar__nav" aria-label={t("nav.label")}>
        {/* NavLink adds the "active" class and aria-current="page" to the current page. */}
        {items.map((item) => (
          <NavLink key={item.to} className="app-sidebar__link" to={item.to} end={item.end}>
            <Icon name={item.icon} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="app-sidebar__privacy">
        <Icon name="shield" size={18} />
        <p>
          <strong>{t("nav.privacyTitle")}</strong>
          <span>{t("nav.privacyText")}</span>
        </p>
      </div>

      <div className="app-sidebar__profile">
        <span className="avatar" aria-hidden="true">
          {getInitials(user.name)}
        </span>
        <p>
          <strong>{user.name}</strong>
          <span>{t(`roles.${user.role}`, { defaultValue: user.role })}</span>
        </p>
        <button
          className="icon-button"
          type="button"
          onClick={logout}
          aria-label={t("nav.logout")}
          title={t("nav.logout")}
        >
          <Icon name="logout" size={18} />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
