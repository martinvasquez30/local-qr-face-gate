import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";

/**
 * Bottom menu for phones and tablets, within reach of the thumb. Bootstrap
 * hides it from the "lg" breakpoint up (d-lg-none), where the side menu shows.
 */
function BottomNav({ items }) {
  const { t } = useTranslation();
  const phoneItems = items.filter((item) => item.inBottomNav !== false);

  return (
    <nav className="app-bottom-nav d-lg-none" aria-label={t("nav.label")}>
      {phoneItems.map((item) => (
        <NavLink key={item.to} className="app-bottom-nav__link" to={item.to} end={item.end}>
          {/* The pill behind the icon marks the current page, not only the color. */}
          <span className="app-bottom-nav__icon">
            <Icon name={item.icon} size={22} />
          </span>
          <span>{t(item.shortLabelKey ?? item.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
