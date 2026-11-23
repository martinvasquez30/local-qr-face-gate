import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Icon from "../components/Icon.jsx";
import { formatAgo } from "./formatAgo.js";
import { listTerminals } from "./terminalsApi.js";

// Same rhythm as the kiosk heartbeat (30 s).
const REFRESH_EVERY_MS = 30000;

/**
 * "Access points" card of the admin home: each kiosk with its place, entry
 * or exit, and whether it is connected. The server decides "connected" (a
 * contact in the last 90 s); this card only shows it and asks again every 30 s.
 */
function TerminalsPanel() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const [terminals, setTerminals] = useState(null);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    let controller = null;
    function load() {
      controller?.abort();
      controller = new AbortController();
      listTerminals(token, { signal: controller.signal })
        .then((data) => {
          setTerminals(data);
          setErrorCode(null);
        })
        .catch((error) => {
          if (error.name !== "AbortError") setErrorCode(errorCodeOf(error));
        });
    }
    load();
    const timer = setInterval(load, REFRESH_EVERY_MS);
    return () => {
      clearInterval(timer);
      controller?.abort();
    };
  }, [token]);

  return (
    <section className="panel panel--padded h-100">
      <h2 className="section-title">{t("terminals.title")}</h2>
      <p className="panel__subtitle">{t("terminals.subtitle")}</p>
      <ErrorMessage code={errorCode} />

      {terminals?.length === 0 && <p className="empty">{t("terminals.empty")}</p>}

      {terminals?.length > 0 && (
        <ul className="terminal-list">
          {terminals.map((terminal) => {
            const status = terminal.is_online ? "online" : "offline";
            return (
              <li key={`${terminal.location}-${terminal.direction}`} className="terminal-row">
                <span className={`terminal-row__icon terminal-row__icon--${status}`}>
                  <Icon name="terminal" />
                </span>
                <p className="terminal-row__name">
                  <strong>{t(`locations.${terminal.location}`)}</strong>
                  <span>{t(`kiosk.direction.${terminal.direction}`)}</span>
                </p>
                {/* Color plus text: the state is never told by color alone. */}
                <span className={`status status--${status}`}>
                  <span className="status__dot" aria-hidden="true" />
                  {t(`terminals.${status}`)}
                </span>
                <span className="terminal-row__seen">
                  {formatAgo(terminal.seconds_since_seen, i18n.language)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default TerminalsPanel;
