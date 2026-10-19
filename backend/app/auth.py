"""Temporary email/password login.

This is a stand-in until SSO with Microsoft Entra ID is set up. It is the only
module that knows how users log in: the rest of the API asks for the current
user through ``get_current_user``. When SSO arrives, only this file changes.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings
from app.security import (
    InvalidTokenError,
    create_token,
    hash_password,
    verify_password,
    verify_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class User(BaseModel):
    email: str
    name: str
    role: str


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: User


# One demo user kept in memory until there is a database. Only the password
# hash is kept; the plain password is hashed once, when the module loads.
DEMO_USER = User(email="admin@example.com", name="Admin", role="admin")
_USERS: dict[str, User] = {DEMO_USER.email: DEMO_USER}
_PASSWORD_HASHES: dict[str, str] = {DEMO_USER.email: hash_password("admin123")}

# Hash of a random password, checked when the email does not exist. This way
# a failed login takes the same time whether or not the email is registered,
# so the response time does not reveal which emails exist.
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
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)
    ],
) -> User:
    """Dependency that returns the logged-in user or answers 401."""
    if credentials is None:
        raise _unauthorized("not_authenticated")
    try:
        email = verify_token(credentials.credentials, settings.token_secret)
    except InvalidTokenError:
        raise _unauthorized("invalid_token") from None

    user = _USERS.get(email)
    if user is None:
        raise _unauthorized("invalid_token")
    return user


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest) -> LoginResponse:
    """Exchange an email and password for an access token."""
    email = request.email.strip().lower()
    stored_hash = _PASSWORD_HASHES.get(email, _DUMMY_HASH)
    password_ok = verify_password(request.password, stored_hash)
    if email not in _USERS or not password_ok:
        # Same error for unknown email and wrong password.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials"
        )

    token = create_token(email, settings.token_secret, settings.token_ttl_seconds)
    return LoginResponse(
        access_token=token,
        expires_in=settings.token_ttl_seconds,
        user=_USERS[email],
    )


@router.get("/me", response_model=User)
def read_current_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Return the user that owns the token."""
    return user
