import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Icon from "../components/Icon.jsx";
import Pagination from "../components/Pagination.jsx";
import { downloadCsv, toCsv } from "../history/csv.js";
import { EVENT_COLUMNS, describeEvent } from "../history/describeEvent.js";
import EventsTable from "../history/EventsTable.jsx";
import { listAccessEvents, startOfLocalDay, toDateInputValue } from "../history/historyApi.js";
import { filterEvents, summarize } from "../history/stats.js";
import { listUsers } from "../users/usersApi.js";

const PAGE_SIZE = 20;

/**
 * Access history and reports: every attempt at the access point (face or QR,
 * granted or denied), filtered by a range of days, user, method and result.
 * Days and user are filtered by the server; method and result in the browser.
 */
function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const today = toDateInputValue(new Date());
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(today);
  const [userId, setUserId] = useState("");
  const [method, setMethod] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
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

  // Load the events again every time a server filter changes.
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

  // Any filter change goes back to the first page.
  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  function clearFilters() {
    setFromDay(today);
    setToDay(today);
    setUserId("");
    setMethod("");
    setResult("");
    setPage(1);
  }

  const userNames = Object.fromEntries(users.map((user) => [user.id, user.name]));
  const shownEvents = filterEvents(events, { method, result });
  const summary = summarize(shownEvents);
  const pageEvents = shownEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // The CSV has every filtered event (all pages), with the same texts as the table.
  function exportCsv() {
    const header = EVENT_COLUMNS.map((column) => t(`history.fields.${column}`));
    const rows = shownEvents.map((event) => {
      const text = describeEvent(event, { t, language: i18n.language, userNames });
      return EVENT_COLUMNS.map((column) => text[column]);
    });
    downloadCsv(`access-history_${fromDay}_${toDay}.csv`, toCsv([header, ...rows]));
  }

  return (
    <section className="card card--wide">
      <div className="page-intro">
        <div>
          <h1 className="title">{t("history.title")}</h1>
          <p className="subtitle">{t("history.subtitle")}</p>
        </div>
        <button
          className="button button--secondary button--icon"
          type="button"
          onClick={exportCsv}
          disabled={shownEvents.length === 0}
        >
          <Icon name="download" size={18} />
          {t("history.exportCsv")}
        </button>
      </div>

      {/* Bootstrap grid: 1 column on phones, 2 on tablets, 3 on large screens. */}
      <div className="row g-3 mb-3">
        <label className="field col-12 col-md-6 col-xl-4">
          <span className="field__label">{t("history.from")}</span>
          <input
            className="field__input"
            type="date"
            value={fromDay}
            onChange={changeFilter(setFromDay)}
          />
        </label>
        <label className="field col-12 col-md-6 col-xl-4">
          <span className="field__label">{t("history.to")}</span>
          <input
            className="field__input"
            type="date"
            value={toDay}
            onChange={changeFilter(setToDay)}
          />
        </label>
        <label className="field col-12 col-md-6 col-xl-4">
          <span className="field__label">{t("history.user")}</span>
          <select className="field__input" value={userId} onChange={changeFilter(setUserId)}>
            <option value="">{t("history.allUsers")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field col-12 col-md-6 col-xl-4">
          <span className="field__label">{t("history.fields.method")}</span>
          <select className="field__input" value={method} onChange={changeFilter(setMethod)}>
            <option value="">{t("history.allMethods")}</option>
            <option value="face">{t("history.method.face")}</option>
            <option value="qr">{t("history.method.qr")}</option>
          </select>
        </label>
        <label className="field col-12 col-md-6 col-xl-4">
          <span className="field__label">{t("history.fields.result")}</span>
          <select className="field__input" value={result} onChange={changeFilter(setResult)}>
            <option value="">{t("history.allResults")}</option>
            <option value="granted">{t("history.result.granted")}</option>
            <option value="denied">{t("history.result.denied")}</option>
          </select>
        </label>
        <div className="col-12 col-md-6 col-xl-4 d-flex align-items-end">
          <button className="button button--secondary w-100" type="button" onClick={clearFilters}>
            {t("history.clearFilters")}
          </button>
        </div>
      </div>

      <ErrorMessage code={isRangeValid ? errorCode : "invalid_date_range"} />

      {isRangeValid && !isLoading && (
        <p className="history-summary" role="status">
          {t("history.summary", summary)}
        </p>
      )}

      {isRangeValid &&
        (isLoading && events.length === 0 ? (
          <p className="loading" role="status">
            {t("app.loading")}
          </p>
        ) : shownEvents.length === 0 ? (
          <p className="empty">{t("history.empty")}</p>
        ) : (
          <>
            <EventsTable events={pageEvents} userNames={userNames} />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={shownEvents.length}
              onChange={setPage}
            />
          </>
        ))}
    </section>
  );
}

export default HistoryPage;
