import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import BottomNav from "./BottomNav.jsx";
import { findCurrentItem, getNavItems } from "./navItems.js";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";

/**
 * Frame of the logged-in pages: side menu (large screens) or bottom menu
 * (small screens), top bar and the page itself (children).
 */
function AppShell({ children }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const items = getNavItems(user);
  const current = findCurrentItem(items, pathname);
  const title = current ? t(current.labelKey) : t("app.title");

  return (
    <div className="app-shell">
      <Sidebar items={items} />
      <div className="app-shell__main">
        <TopBar title={title} />
        <main className="page">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}

export default AppShell;
