"""Temporary email/password login.

This is a stand-in until SSO with Microsoft Entra ID is set up. It is the only
module that knows how users log in: the rest of the API asks for the current
user through ``get_current_user`` (or ``require_admin``). When SSO arrives,
only this file changes.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select

from app.config import settings
from app.database import DbSession
from app.models import ROLE_ADMIN, User, normalize_email
from app.schemas import UserOut
from app.security import InvalidTokenError, create_token, hash_password, verify_password, verify_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# Hash of a random password, checked when the user cannot log in (unknown
# email, inactive, or no password). This way a failed login always takes the
# same time, so the response time does not reveal which emails exist.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))

# Reads "Authorization: Bearer <token>". auto_error=False lets us return our
# own error codes instead of FastAPI's default message.
_bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(code: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=code,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    db: DbSession,
) -> User:
    """Dependency that returns the logged-in user or answers 401."""
    if credentials is None:
        raise _unauthorized("not_authenticated")
    try:
        user_id = int(verify_token(credentials.credentials, settings.token_secret))
    except (InvalidTokenError, ValueError):
        raise _unauthorized("invalid_token") from None

    # The user is read from the database on every request, so a deactivation
    # takes effect immediately, even for tokens issued before it.
    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized("invalid_token")
    if not user.is_active:
        raise _unauthorized("inactive_user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    """Dependency for admin-only endpoints: 403 for any other role."""
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return user


CurrentAdmin = Annotated[User, Depends(require_admin)]


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: DbSession) -> LoginResponse:
    """Exchange an email and password for an access token."""
    user = db.scalar(select(User).where(User.email == normalize_email(request.email)))
    can_log_in = user is not None and user.is_active and user.password_hash is not None

    # Always check a password, even when the user cannot log in (same time).
    stored_hash = user.password_hash if can_log_in else _DUMMY_HASH
    password_ok = verify_password(request.password, stored_hash)
    if not (can_log_in and password_ok):
        # Same error for every case, so it does not reveal which one failed.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials"
        )

    # The token stores the user id: unlike the email, it never changes.
    token = create_token(str(user.id), settings.token_secret, settings.token_ttl_seconds)
    return LoginResponse(
        access_token=token,
        expires_in=settings.token_ttl_seconds,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def read_current_user(user: CurrentUser) -> User:
    """Return the user that owns the token."""
    return user
