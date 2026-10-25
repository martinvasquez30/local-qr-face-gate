"""Database tables."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.database import Base

ROLE_ADMIN = "admin"  # Uses the admin portal.
ROLE_MEMBER = "member"  # Passes through access points; does not log in.


def normalize_email(email: str) -> str:
    """Emails are compared and stored trimmed and in lowercase."""
    return email.strip().lower()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


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
