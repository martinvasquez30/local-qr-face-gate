// The pages in the menu. The side bar (desktop) and the bottom bar (phones)
// both read this list, so a new page is added in one place only.
const MEMBER_ITEMS = [
  { to: "/", labelKey: "nav.home", icon: "home", end: true },
  { to: "/my-qr", labelKey: "nav.myQr", icon: "qr" },
];

const ADMIN_ITEMS = [
  { to: "/users", labelKey: "nav.users", icon: "users" },
  // Not in the bottom bar (5 entries at most fit on a phone): on phones it is
  // the main button of the home page.
  { to: "/qr", labelKey: "nav.issueQr", icon: "qr", inBottomNav: false },
  { to: "/history", labelKey: "nav.history", icon: "history" },
  // The bottom bar has little room: it uses the short label.
  { to: "/kiosk", labelKey: "nav.kiosk", shortLabelKey: "nav.kioskShort", icon: "terminal" },
];

/** Menu entries for a user: members see Home and My QR, admins see everything. */
export function getNavItems(user) {
  if (user?.role === "admin") return [...MEMBER_ITEMS, ...ADMIN_ITEMS];
  return MEMBER_ITEMS;
}

/** The menu entry of the current page ("/users/3/face" belongs to "/users"). */
export function findCurrentItem(items, pathname) {
  return items.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  );
}
