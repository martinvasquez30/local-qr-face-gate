"""Application settings read from environment variables.

Every setting has a development default, so the server runs without any setup.
Set the variables explicitly in any shared or production environment.
"""

import os
import secrets
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # Secret key used to sign access tokens.
    token_secret: str
    # How long an access token stays valid, in seconds.
    token_ttl_seconds: int
    # Browser origins allowed to call the API (CORS).
    cors_origins: tuple[str, ...]
    # SQLAlchemy database URL. SQLite in development; PostgreSQL later.
    database_url: str


def load_settings() -> Settings:
    """Build the settings from environment variables, falling back to defaults."""
    cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
    return Settings(
        # Without TOKEN_SECRET a random key is generated on every start, so
        # restarting the server invalidates all tokens (everyone is logged out).
        token_secret=os.environ.get("TOKEN_SECRET") or secrets.token_urlsafe(32),
        token_ttl_seconds=int(os.environ.get("TOKEN_TTL_SECONDS", "3600")),
        cors_origins=tuple(
            origin.strip() for origin in cors_origins.split(",") if origin.strip()
        ),
        # Relative to the folder the server is started from (backend/).
        database_url=os.environ.get("DATABASE_URL", "sqlite:///./data/app.db"),
    )


settings = load_settings()
