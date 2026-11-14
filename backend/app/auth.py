"""How admins log in.

There are two ways, and both end with the same signed access token:

- SSO with an OpenID Connect provider (Google by default):
  ``/auth/sso/login`` and ``/auth/sso/callback``.
- The temporary email/password login (``/auth/login``), kept for development.

This is the only module that knows how users log in: the rest of the API asks
for the current user through ``get_current_user`` (or ``require_admin``).
"""

import secrets
from typing import Annotated
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

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


# --- SSO (OpenID Connect) -----------------------------------------------------

# Authlib reads the provider's addresses and public keys from the metadata URL
# the first time they are needed. With the "openid" scope it also checks the
# signature of the identity token and gives us its claims (email, name...).
oauth = OAuth()
oauth.register(
    name="sso",
    server_metadata_url=settings.sso_metadata_url,
    client_id=settings.sso_client_id,
    client_secret=settings.sso_client_secret,
    client_kwargs={"scope": "openid email profile"},
)


def find_sso_admin(db: Session, email: str) -> User | None:
    """The active admin with this email, or None. Only admins use the portal."""
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not user.is_active or user.role != ROLE_ADMIN:
        return None
    return user


def _back_to_frontend(**values: str) -> RedirectResponse:
    # The values go after "#": the browser keeps that part of the URL to itself
    # and never sends it to a server, so the token does not end up in any log.
    return RedirectResponse(f"{settings.frontend_url}/#{urlencode(values)}")


# These two endpoints are `async` because Authlib's calls to the provider are.
@router.get("/sso/login")
async def sso_login(request: Request) -> RedirectResponse:
    """Send the browser to the provider's sign-in page."""
    if not settings.sso_client_id:
        return _back_to_frontend(error="sso_not_configured")
    redirect_uri = str(request.url_for("sso_callback"))
    return await oauth.sso.authorize_redirect(request, redirect_uri)


@router.get("/sso/callback", name="sso_callback")
async def sso_callback(request: Request, db: DbSession) -> RedirectResponse:
    """The provider sends the browser back here after the sign-in."""
    try:
        provider_token = await oauth.sso.authorize_access_token(request)
    except OAuthError:
        # The user cancelled, the state did not match, or the provider refused.
        return _back_to_frontend(error="sso_failed")

    claims = provider_token.get("userinfo") or {}
    # Google and most providers send "email"; Microsoft may only send
    # "preferred_username", which is usually the email as well.
    email = claims.get("email") or claims.get("preferred_username")
    # An email the provider has not verified could belong to anyone.
    if not email or claims.get("email_verified") is False:
        return _back_to_frontend(error="sso_not_allowed")

    user = find_sso_admin(db, email)
    if user is None:
        return _back_to_frontend(error="sso_not_allowed")

    # From here on it is the same token as the password login, so
    # get_current_user and the rest of the app do not change.
    token = create_token(str(user.id), settings.token_secret, settings.token_ttl_seconds)
    return _back_to_frontend(token=token)
