"""Database tables."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.database import Base

ROLE_ADMIN = "admin"  # Uses the admin portal.
ROLE_MEMBER = "member"  # Passes through access points; does not log in.

# Allowed values of the access event columns.
METHOD_FACE = "face"
METHOD_QR = "qr"
RESULT_GRANTED = "granted"
RESULT_DENIED = "denied"
DIRECTION_IN = "in"
DIRECTION_OUT = "out"


def normalize_email(email: str) -> str:
    """Emails are compared and stored trimmed and in lowercase."""
    return email.strip().lower()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Return the same moment in UTC.

    A value without a time zone is taken as UTC: that is how SQLite returns the
    dates we stored.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    # Users are deactivated, never deleted: access events and face templates
    # will point to them, and deleting would break the audit history.
    is_active: Mapped[bool] = mapped_column(default=True)
    # Only admins have a password. `str | None` makes the column nullable.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    # Stored in UTC. SQLite does not keep the time zone, so values read back
    # from SQLite have no tzinfo, but they are still UTC.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )

    @validates("email")
    def _normalize_email(self, _key: str, email: str) -> str:
        # Runs every time `email` is assigned, so no code path can store an
        # email with uppercase letters or spaces.
        return normalize_email(email)


class AccessEvent(Base):
    """One attempt to pass through an access point, accepted or not."""

    __tablename__ = "access_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Empty when nobody was recognized (for example, an unknown face).
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    method: Mapped[str] = mapped_column(String(10))  # METHOD_FACE or METHOD_QR
    result: Mapped[str] = mapped_column(String(10))  # RESULT_GRANTED or RESULT_DENIED
    direction: Mapped[str] = mapped_column(String(3))  # DIRECTION_IN or DIRECTION_OUT
    # Face attempts only: distance to the closest enrolled face. Kept to
    # calibrate the match threshold later (see ml/README.md).
    distance: Mapped[float | None] = mapped_column()
    # Stored in UTC, like the user dates. Indexed because reports filter by it.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, index=True
    )
