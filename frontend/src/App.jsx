import { useEffect, useState } from "react";
import { API_BASE_URL } from "./config.js";

const STATUS = {
  CHECKING: "checking",
  ONLINE: "online",
  OFFLINE: "offline",
};

const STATUS_LABELS = {
  [STATUS.CHECKING]: "Checking backend…",
  [STATUS.ONLINE]: "Backend online",
  [STATUS.OFFLINE]: "Backend unreachable",
};

function App() {
  const [backendStatus, setBackendStatus] = useState(STATUS.CHECKING);
  const [backendVersion, setBackendVersion] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackendHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setBackendVersion(data.version);
        setBackendStatus(STATUS.ONLINE);
      } catch (error) {
        if (error.name !== "AbortError") setBackendStatus(STATUS.OFFLINE);
      }
    }

    checkBackendHealth();
    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <section className="card">
        <h1 className="title">Access Control</h1>
        <p className="subtitle">
          Face recognition and dynamic QR access control system.
        </p>

        <div className={`status status--${backendStatus}`} role="status">
          <span className="status__dot" aria-hidden="true" />
          <span>{STATUS_LABELS[backendStatus]}</span>
          {backendVersion && (
            <span className="status__version">v{backendVersion}</span>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
