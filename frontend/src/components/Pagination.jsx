import { useTranslation } from "react-i18next";

/**
 * "Showing 1–20 of 46" plus previous / next buttons. `page` starts at 1.
 * The parent keeps the page number and cuts the list (see HistoryPage).
 */
function Pagination({ page, pageSize, total, onChange }) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null; // One page only: nothing to show.

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pagination-bar" aria-label={t("pagination.label")}>
      <span>{t("pagination.showing", { from, to, total })}</span>
      <div className="d-flex align-items-center gap-2">
        <button
          className="button button--secondary button--small"
          type="button"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          {t("pagination.previous")}
        </button>
        <span aria-live="polite">{t("pagination.page", { page, pages: pageCount })}</span>
        <button
          className="button button--secondary button--small"
          type="button"
          disabled={page === pageCount}
          onClick={() => onChange(page + 1)}
        >
          {t("pagination.next")}
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
