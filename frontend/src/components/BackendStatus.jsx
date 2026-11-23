import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../api.js";

const STATUS = {
  CHECKING: "checking",
  ONLINE: "online",
  OFFLINE: "offline",
};

// How often the server is asked again (30 s).
const CHECK_EVERY_MS = 30_000;

/**
 * Small pill in the top bar: whether the local server answers. It asks
 * /health now, every 30 s, and as soon as the device's network comes back
 * or goes away (the browser's "online" / "offline" events).
 */
function BackendStatus() {
  const { t } = useTranslation();
  const [backendStatus, setBackendStatus] = useState(STATUS.CHECKING);
  const [backendVersion, setBackendVersion] = useState(null);

  useEffect(() => {
    let controller = null;

    function check() {
      controller?.abort(); // Only the newest check counts.
      controller = new AbortController();
      apiRequest("/health", { signal: controller.signal })
        .then((data) => {
          setBackendVersion(data.version);
          setBackendStatus(STATUS.ONLINE);
        })
        .catch((error) => {
          if (error.name !== "AbortError") setBackendStatus(STATUS.OFFLINE);
        });
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      controller?.abort();
    };
  }, []);

  const text = t(`backendStatus.${backendStatus}`);

  return (
    <div
      className={`status status--${backendStatus}`}
      role="status"
      title={backendVersion ? `${text} · v${backendVersion}` : text}
    >
      <span className="status__dot" aria-hidden="true" />
      {/* On phones only the dot shows; the text stays for screen readers. */}
      <span className="status__text">{text}</span>
    </div>
  );
}

export default BackendStatus;
