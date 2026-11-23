import Brand from "./Brand.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

/** Frame of the screens without a menu: login, loading and the kiosk. */
function PublicLayout({ children }) {
  return (
    <div className="app-public">
      <header className="app-topbar d-flex align-items-center justify-content-between gap-3">
        <Brand />
        <LanguageSwitcher />
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

export default PublicLayout;
