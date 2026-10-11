"""Entry point for the central server API.

The central server manages users, SSO and reports, and receives access events
from the offline terminals when they are back online.
"""

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

APP_VERSION = "0.1.0"

app = FastAPI(
    title="Access Control API",
    description="Face recognition and dynamic QR access control system.",
    version=APP_VERSION,
)

# Allow the local frontend (Vite dev server) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health_check() -> dict:
    """Report that the service is running."""
    return {
        "status": "ok",
        "version": APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
