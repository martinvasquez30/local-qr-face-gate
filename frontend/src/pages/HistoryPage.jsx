import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { listAccessEvents, startOfLocalDay, toDateInputValue } from "../history/historyApi.js";
import { listUsers } from "../users/usersApi.js";

/**
 * Access history and reports: every attempt at the access point (face or QR,
 * granted or denied), filtered by a range of days and by user.
 */
function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const today = toDateInputValue(new Date());
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(today);
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  // All users, also inactive ones: old events can belong to them.
  useEffect(() => {
    listUsers(token, { includeInactive: true })
      .then(setUsers)
      .catch((error) => setErrorCode(errorCodeOf(error)));
  }, [token]);

  const isRangeValid = !fromDay || !toDay || fromDay <= toDay;

  // Load the events again every time a filter changes.
  useEffect(() => {
    if (!isRangeValid) return undefined;
    const controller = new AbortController();
    setIsLoading(true);
    listAccessEvents(token, {
      start: fromDay ? startOfLocalDay(fromDay) : undefined,
      // The whole "to" day: up to the start of the next one.
      end: toDay ? startOfLocalDay(toDay, 1) : undefined,
      userId,
      signal: controller.signal,
    })
      .then((data) => {
        setEvents(data);
        setErrorCode(null);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setErrorCode(errorCodeOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    // A newer filter cancels the older request, so old results never win.
    return () => controller.abort();
  }, [token, fromDay, toDay, userId, isRangeValid]);

  const userNames = Object.fromEntries(users.map((user) => [user.id, user.name]));
  const grantedCount = events.filter((event) => event.result === "granted").length;

  return (
    <section className="card card--wide">
      <h1 className="title">{t("history.title")}</h1>
      <p className="subtitle">{t("history.subtitle")}</p>

      <div className="history-filters">
        <label className="field">
          <span className="field__label">{t("history.from")}</span>
          <input
            className="field__input"
            type="date"
            value={fromDay}
            onChange={(event) => setFromDay(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{t("history.to")}</span>
          <input
            className="field__input"
            type="date"
            value={toDay}
            onChange={(event) => setToDay(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{t("history.user")}</span>
          <select
            className="field__input"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">{t("history.allUsers")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorMessage code={isRangeValid ? errorCode : "invalid_date_range"} />

      {isRangeValid && !isLoading && (
        <p className="history-summary" role="status">
          {t("history.summary", {
            total: events.length,
            granted: grantedCount,
            denied: events.length - grantedCount,
          })}
        </p>
      )}

      {isRangeValid &&
        (isLoading && events.length === 0 ? (
          <p className="loading" role="status">
            {t("app.loading")}
          </p>
        ) : events.length === 0 ? (
          <p className="empty">{t("history.empty")}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("history.fields.when")}</th>
                <th scope="col">{t("history.fields.user")}</th>
                <th scope="col">{t("history.fields.method")}</th>
                <th scope="col">{t("history.fields.result")}</th>
                <th scope="col">{t("history.fields.direction")}</th>
                <th scope="col">{t("history.fields.distance")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                // data-label is shown next to each value on narrow screens.
                <tr key={event.id}>
                  <td data-label={t("history.fields.when")}>
                    {/* The API sends UTC; the browser shows local time. */}
                    {new Date(event.created_at).toLocaleString(i18n.language)}
                  </td>
                  <td data-label={t("history.fields.user")}>
                    {event.user_id === null
                      ? t("history.unknownUser")
                      : (userNames[event.user_id] ?? `#${event.user_id}`)}
                  </td>
                  <td data-label={t("history.fields.method")}>
                    {t(`history.method.${event.method}`)}
                  </td>
                  <td data-label={t("history.fields.result")}>
                    <span className={`badge badge--${event.result}`}>
                      {t(`history.result.${event.result}`)}
                    </span>
                  </td>
                  <td data-label={t("history.fields.direction")}>
                    {t(`kiosk.direction.${event.direction}`)}
                  </td>
                  <td data-label={t("history.fields.distance")}>
                    {event.distance === null ? "—" : event.distance.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
}

export default HistoryPage;
