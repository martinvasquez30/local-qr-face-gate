"""Database tables."""

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.database import Base

ROLE_ADMIN = "admin"  # Uses the admin portal.
ROLE_MEMBER = "member"  # Passes through access points; logs in (SSO) only for "My QR".

# Allowed values of the access event columns.
METHOD_FACE = "face"
METHOD_QR = "qr"
RESULT_GRANTED = "granted"
RESULT_DENIED = "denied"
DIRECTION_IN = "in"
DIRECTION_OUT = "out"

# A face descriptor (from face-api in the browser) is a list of 128 numbers.
DESCRIPTOR_LENGTH = 128


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
    # Secret key of the user's personal QR codes (see qr.py). The user's own
    # device signs codes with it, so they can be made without internet. Empty
    # until the user opens "My QR"; getting a new key replaces the old one.
    qr_key: Mapped[str | None] = mapped_column(String(64))
    # Stored in UTC. SQLite does not keep the time zone, so values read back
    # from SQLite have no tzinfo, but they are still UTC.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )

    # The user's enrolled face, if any. "selectin" loads the faces of a whole
    # list of users in one extra query, not one query per user.
    face_template: Mapped["FaceTemplate | None"] = relationship(lazy="selectin")

    @property
    def has_face(self) -> bool:
        """True when a face is enrolled. Only this yes/no leaves the server."""
        return self.face_template is not None

    @validates("email")
    def _normalize_email(self, _key: str, email: str) -> str:
        # Runs every time `email` is assigned, so no code path can store an
        # email with uppercase letters or spaces.
        return normalize_email(email)


class FaceTemplate(Base):
    """The enrolled face of one user: only numbers, never a photo.

    It is the average of the descriptors captured when enrolling. One row per
    user; enrolling again replaces it.
    """

    __tablename__ = "face_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    # DESCRIPTOR_LENGTH numbers, stored as a JSON list.
    descriptor: Mapped[list[float]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class UsedQrNonce(Base):
    """The random part of every QR code that was already accepted (both kinds:
    issued by an admin, or made by the user's device).

    The column is the primary key, so the database itself refuses a second
    copy: that is what makes each QR code single use.
    """

    __tablename__ = "used_qr_nonces"

    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class AccessEvent(Base):
    """One attempt to pass through an access point, accepted or not."""

    __tablename__ = "access_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Empty when nobody was recognized (for example, an unknown face).
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    method: Mapped[str] = mapped_column(String(10))  # METHOD_FACE or METHOD_QR
    result: Mapped[str] = mapped_column(String(10))  # RESULT_GRANTED or RESULT_DENIED
    direction: Mapped[str] = mapped_column(String(3))  # DIRECTION_IN or DIRECTION_OUT
    # Face attempts only: distance to the closest enrolled face. Kept to check
    # the match threshold with real attempts.
    distance: Mapped[float | None] = mapped_column()
    # Denied attempts only: why, as a translatable code. Face: "liveness_failed"
    # (no head turn), "face_no_match", "face_ambiguous" or "no_faces_enrolled".
    # QR: "qr_invalid", "qr_expired", "qr_already_used" or "user_inactive".
    reason: Mapped[str | None] = mapped_column(String(30))
    # Where the access point is ("library", "physics_lab"...; see Location in
    # schemas.py). Empty for events logged before kiosks had a location.
    location: Mapped[str | None] = mapped_column(String(30))
    # Stored in UTC, like the user dates. Indexed because reports filter by it.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, index=True
    )


class Terminal(Base):
    """An access point (kiosk), known by its place and whether it is an entry
    or an exit. Nobody registers it by hand: its row is created the first time
    the kiosk talks to the server, and every later contact (an access check or
    the heartbeat every 30 s) updates `last_seen_at`.
    """

    __tablename__ = "terminals"
    # One row per place and direction: "library, entry" is one terminal.
    __table_args__ = (UniqueConstraint("location", "direction"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    location: Mapped[str] = mapped_column(String(30))
    direction: Mapped[str] = mapped_column(String(3))  # DIRECTION_IN or DIRECTION_OUT
    # Stored in UTC. The admin home shows "connected" when it is recent.
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
