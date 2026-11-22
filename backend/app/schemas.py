"""Shapes of the data the API receives and returns (Pydantic).

They are separate from the database models on purpose: the API never returns
fields like `password_hash`, and clients can only send the fields listed here.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    FiniteFloat,
    StringConstraints,
    field_validator,
)

from app.models import DESCRIPTOR_LENGTH, as_utc, normalize_email

Role = Literal["admin", "member"]

# Spaces at both ends are removed first, then the name must not be empty.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class UserOut(BaseModel):
    """Public view of a user."""

    # Allows building it from a SQLAlchemy object: UserOut.model_validate(user).
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: str
    is_active: bool
    # Whether a face is enrolled (the face numbers themselves are never sent).
    has_face: bool = False


class UserCreate(BaseModel):
    name: Name
    email: EmailStr
    role: Role = "member"

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        # Runs before the email format check, so " Ana@X.com " becomes valid.
        return normalize_email(value) if isinstance(value, str) else value


class UserUpdate(BaseModel):
    """Every field is optional: only the fields that are sent change."""

    name: Name | None = None
    role: Role | None = None
    is_active: bool | None = None


# Exactly 128 real numbers (FiniteFloat rejects NaN and infinity).
Descriptor = Annotated[
    list[FiniteFloat], Field(min_length=DESCRIPTOR_LENGTH, max_length=DESCRIPTOR_LENGTH)
]


class FaceEnroll(BaseModel):
    """Descriptors captured in the browser (1 to 5). The server keeps their average."""

    descriptors: list[Descriptor] = Field(min_length=1, max_length=5)


class FaceStatus(BaseModel):
    """Whether a user has an enrolled face. It never includes the numbers."""

    enrolled: bool
    updated_at: datetime | None = None

    @field_validator("updated_at")
    @classmethod
    def _in_utc(cls, value: datetime | None) -> datetime | None:
        return as_utc(value) if value is not None else None


Direction = Literal["in", "out"]

# Where an access point is. A fixed list, so the UI can translate each place
# (locations.<code> in es.json / en.json). To add a place, add it here and there.
Location = Literal[
    "main_entrance", "library", "physics_lab", "computer_lab", "chemistry_lab", "auditorium"
]


class FaceAccessRequest(BaseModel):
    """What the access point sends: the face it sees (128 numbers), never a photo."""

    descriptor: Descriptor
    direction: Direction = "in"
    # Whether the person turned their head when the kiosk asked (liveness
    # check: a flat photo cannot). Required, so a kiosk can never skip the
    # check by leaving it out.
    liveness_passed: bool
    # Optional, so a kiosk set up before places existed keeps working.
    location: Location | None = None


class QrAccessRequest(BaseModel):
    """What the access point sends after reading a QR code: the text inside it."""

    token: str = Field(min_length=1, max_length=2000)
    direction: Direction = "in"
    location: Location | None = None


class HeartbeatRequest(BaseModel):
    """What the kiosk sends every 30 s to say "I am here"."""

    location: Location
    direction: Direction = "in"


class TerminalOut(BaseModel):
    """An access point as the admin home shows it."""

    location: str
    direction: str
    last_seen_at: datetime
    # Counted by the server, so a wrong clock in the browser does not matter.
    seconds_since_seen: int
    is_online: bool


class QrIssued(BaseModel):
    """A new QR code for a user: the text to draw as a QR, and its lifetime."""

    token: str
    expires_in: int


class PersonalQrKey(BaseModel):
    """The secret key the user's device uses to make personal QR codes offline."""

    key: str
    user_id: int
    # A new code every `step_seconds` (30).
    step_seconds: int


class AccessDecision(BaseModel):
    """The server's answer to the access point. It never includes face data."""

    result: Literal["granted", "denied"]
    # Only when access is granted: who came in.
    user_name: str | None = None
    # Distance to the closest enrolled face (shown for the demo and the logs).
    distance: float | None = None
    # Why a QR code was denied, as a translatable code (e.g. "qr_already_used").
    reason: str | None = None


class AccessEventOut(BaseModel):
    """Public view of an access event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    method: str
    result: str
    direction: str
    distance: float | None
    # Why a denied attempt was denied, as a translatable code.
    reason: str | None
    location: str | None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def _in_utc(cls, value: datetime) -> datetime:
        # SQLite returns the date without a time zone. Marking it as UTC makes the
        # JSON end in "Z", so the browser shows it in the viewer's local time.
        return as_utc(value)
