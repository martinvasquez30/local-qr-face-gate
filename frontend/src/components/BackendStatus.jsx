import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../api.js";

const STATUS = {
  CHECKING: "checking",
  ONLINE: "online",
  OFFLINE: "offline",
};

function BackendStatus() {
  const { t } = useTranslation();
  const [backendStatus, setBackendStatus] = useState(STATUS.CHECKING);
  const [backendVersion, setBackendVersion] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/health", { signal: controller.signal })
      .then((data) => {
        setBackendVersion(data.version);
        setBackendStatus(STATUS.ONLINE);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setBackendStatus(STATUS.OFFLINE);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className={`status status--${backendStatus}`} role="status">
      <span className="status__dot" aria-hidden="true" />
      <span>{t(`backendStatus.${backendStatus}`)}</span>
      {backendVersion && <span className="status__version">v{backendVersion}</span>}
    </div>
  );
}

export default BackendStatus;
