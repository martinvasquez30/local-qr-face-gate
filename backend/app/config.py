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
    # SQLAlchemy database URL. SQLite locally; PostgreSQL (Supabase) in the online demo.
    database_url: str
    # SSO (OpenID Connect). The metadata URL says which provider is used:
    # Google, Microsoft or any other works with the same code.
    sso_metadata_url: str
    # Given by the provider when the app is registered. Empty = SSO turned off.
    sso_client_id: str
    sso_client_secret: str
    # Signs the short-lived cookie that keeps the SSO state between the trip to
    # the provider and the way back.
    session_secret: str
    # Where the browser goes after SSO, with the token or an error code.
    frontend_url: str
    # Key the access point (kiosk) sends in the X-Terminal-Key header. It plays
    # the role of a device token: the kiosk has no user login.
    terminal_key: str
    # Face matching: accept when the closest enrolled face is nearer than
    # `face_match_threshold` and at least `face_match_margin` nearer than the
    # second closest one (so two similar people are never confused).
    face_match_threshold: float
    face_match_margin: float
    # Signs QR codes. It must be different from token_secret: with the same key,
    # a QR code would also work as a login token.
    qr_secret: str
    # How long a QR code is valid, in seconds.
    qr_ttl_seconds: int
    # False in the online demo: face descriptors are biometric data and must not
    # reach a cloud server. Users, QR codes, history and SSO still work.
    face_recognition_enabled: bool
    # Email of the first admin, created (without a password, so SSO only) when
    # the database is empty. Empty = the development admin with a known password,
    # which must never exist on a public server.
    initial_admin_email: str


GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"


def _is_on(value: str) -> bool:
    """Read an on/off variable: anything except "false", "0", "no" or "off" is on."""
    return value.strip().lower() not in ("false", "0", "no", "off")


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
        sso_metadata_url=os.environ.get("SSO_METADATA_URL", GOOGLE_METADATA_URL),
        sso_client_id=os.environ.get("SSO_CLIENT_ID", ""),
        sso_client_secret=os.environ.get("SSO_CLIENT_SECRET", ""),
        session_secret=os.environ.get("SESSION_SECRET") or secrets.token_urlsafe(32),
        frontend_url=os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/"),
        # A fixed development value, so the kiosk works without setup. Set your
        # own TERMINAL_KEY in any shared environment.
        terminal_key=os.environ.get("TERMINAL_KEY", "dev-terminal-key"),
        # 0.5 is stricter than face-api's usual 0.6: letting the wrong person in
        # is worse than rejecting the right one, who can still use a QR code.
        face_match_threshold=float(os.environ.get("FACE_MATCH_THRESHOLD", "0.5")),
        face_match_margin=float(os.environ.get("FACE_MATCH_MARGIN", "0.05")),
        # Random on every start if not set: QR codes only live a minute anyway.
        qr_secret=os.environ.get("QR_SECRET") or secrets.token_urlsafe(32),
        qr_ttl_seconds=int(os.environ.get("QR_TTL_SECONDS", "60")),
        face_recognition_enabled=_is_on(os.environ.get("FACE_RECOGNITION_ENABLED", "true")),
        initial_admin_email=os.environ.get("INITIAL_ADMIN_EMAIL", "").strip(),
    )


settings = load_settings()
