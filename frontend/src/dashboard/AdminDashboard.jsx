import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { FACE_RECOGNITION_ENABLED } from "../config.js";
import EventsTable from "../history/EventsTable.jsx";
import { listAccessEvents, startOfLocalDay, toDateInputValue } from "../history/historyApi.js";
import { countByHour, summarize } from "../history/stats.js";
import { listUsers } from "../users/usersApi.js";
import HourlyChart from "./HourlyChart.jsx";
import MetricCard from "./MetricCard.jsx";
import TerminalsPanel from "./TerminalsPanel.jsx";

const RECENT_COUNT = 5;

/**
 * Today's summary for admins. Everything is calculated from two existing API
 * calls (today's access events and the users); there is no special endpoint.
 */
function AdminDashboard() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const today = toDateInputValue(new Date());
    // Both requests at the same time; the page waits for the two.
    Promise.all([
      listAccessEvents(token, {
        start: startOfLocalDay(today),
        end: startOfLocalDay(today, 1),
        signal: controller.signal,
      }),
      listUsers(token, { includeInactive: true, signal: controller.signal }),
    ])
      .then(([todayEvents, allUsers]) => {
        setEvents(todayEvents);
        setUsers(allUsers);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setErrorCode(errorCodeOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  if (isLoading) {
    return (
      <p className="loading" role="status">
        {t("app.loading")}
      </p>
    );
  }

  const summary = summarize(events);
  const activeUsers = users.filter((user) => user.is_active);
  const withFace = activeUsers.filter((user) => user.has_face).length;
  const userNames = Object.fromEntries(users.map((user) => [user.id, user.name]));

  return (
    <>
      <ErrorMessage code={errorCode} />

      {/* Bootstrap grid: 1 column on phones, 2 on tablets, 4 on large screens. */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard
            icon="check"
            tone="green"
            label={t("dashboard.granted")}
            value={summary.granted}
          />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard icon="x" tone="red" label={t("dashboard.denied")} value={summary.denied} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard
            icon="history"
            tone="blue"
            label={t("dashboard.successRate")}
            value={summary.successRate === null ? "—" : `${summary.successRate}%`}
            note={
              summary.total === 0
                ? t("dashboard.noAttempts")
                : t("dashboard.successNote", { granted: summary.granted, total: summary.total })
            }
          />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard
            icon="users"
            tone="amber"
            label={t("dashboard.activeUsers")}
            value={activeUsers.length}
            note={FACE_RECOGNITION_ENABLED ? t("dashboard.withFace", { count: withFace }) : null}
          />
        </div>
      </div>

      {/* Chart and access points side by side from 1200px, stacked below. */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-xl-7">
          <section className="panel panel--padded h-100">
            <h2 className="section-title">{t("dashboard.hourlyTitle")}</h2>
            <p className="panel__subtitle">{t("dashboard.hourlySubtitle")}</p>
            <HourlyChart counts={countByHour(events)} />
          </section>
        </div>
        <div className="col-12 col-xl-5">
          <TerminalsPanel />
        </div>
      </div>

      <section className="panel panel--padded">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <h2 className="section-title">{t("dashboard.recentTitle")}</h2>
            <p className="panel__subtitle">{t("dashboard.recentSubtitle")}</p>
          </div>
          <Link className="button button--secondary button--small" to="/history">
            {t("dashboard.viewHistory")}
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="empty">{t("dashboard.recentEmpty")}</p>
        ) : (
          // The API sends the newest first.
          <EventsTable events={events.slice(0, RECENT_COUNT)} userNames={userNames} compact />
        )}
      </section>
    </>
  );
}

export default AdminDashboard;
