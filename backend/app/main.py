"""Entry point for the central server API.

The central server manages users, SSO and reports, and receives access events
from the offline terminals when they are back online.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import auth, users
from app.config import settings
from app.database import init_db

APP_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Code before `yield` runs once when the server starts; code after it
    # would run on shutdown.
    init_db()
    yield


app = FastAPI(
    title="Access Control API",
    description="Face recognition and dynamic QR access control system.",
    version=APP_VERSION,
    lifespan=lifespan,
)

# Allow the frontend (by default the local Vite dev server) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    """Invalid request data (e.g. a bad email) -> 422 with a translatable code.

    FastAPI's default puts a list of field errors in `detail`. We keep the
    convention that `detail` is always a code, and move the list to `errors`.
    """
    return JSONResponse(
        status_code=422,
        content={"detail": "invalid_input", "errors": jsonable_encoder(exc.errors())},
    )


@app.get("/health", tags=["system"])
def health_check() -> dict:
    """Report that the service is running."""
    return {
        "status": "ok",
        "version": APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
