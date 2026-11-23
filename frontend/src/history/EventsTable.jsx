import { useTranslation } from "react-i18next";
import { COMPACT_COLUMNS, EVENT_COLUMNS, describeEvent } from "./describeEvent.js";

/**
 * Table of access events, used by the history page and (short version,
 * `compact`) by the home page. On phones each row becomes a card (App.css).
 */
function EventsTable({ events, userNames, compact = false }) {
  const { t, i18n } = useTranslation();
  const columns = compact ? COMPACT_COLUMNS : EVENT_COLUMNS;

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {t(`history.fields.${column}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const text = describeEvent(event, { t, language: i18n.language, userNames });
          return (
            <tr key={event.id}>
              {columns.map((column) => (
                // data-label is shown next to each value on narrow screens.
                <td key={column} data-label={t(`history.fields.${column}`)}>
                  {/* The result is a badge: color plus text, never color alone. */}
                  {column === "result" ? (
                    <span className={`badge badge--${event.result}`}>{text.result}</span>
                  ) : (
                    text[column]
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default EventsTable;
