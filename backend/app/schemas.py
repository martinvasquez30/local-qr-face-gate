"""Shapes of the data the API receives and returns (Pydantic).

They are separate from the database models on purpose: the API never returns
fields like `password_hash`, and clients can only send the fields listed here.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, field_validator

from app.models import as_utc, normalize_email

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


class AccessEventOut(BaseModel):
    """Public view of an access event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    method: str
    result: str
    direction: str
    distance: float | None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def _in_utc(cls, value: datetime) -> datetime:
        # SQLite returns the date without a time zone. Marking it as UTC makes the
        # JSON end in "Z", so the browser shows it in the viewer's local time.
        return as_utc(value)
