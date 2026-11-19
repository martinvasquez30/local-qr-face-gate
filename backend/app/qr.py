"""Dynamic QR codes. There are two kinds, and the kiosk accepts both.

1. Issued by an admin (POST /users/{id}/qr), for example for a visitor. The QR
   holds a signed token, made with the same create_token as the login token but
   with its own secret (settings.qr_secret), so a QR code can never be used to
   log in. Its subject is "<user_id>:<nonce>".

2. Personal codes, made by the user's own device ("My QR" page), so they can be
   made without internet. It works like the codes of an authenticator app
   (TOTP, RFC 6238): while online, the user gets a secret key of their own
   (POST /me/qr-key). Then the browser signs, every 30 seconds, the text
   "<user_id>:<step>:<nonce>" with that key (HMAC-SHA256), where <step> is the
   number of 30-second periods since 1970. The QR text is
   "P:<user_id>:<step>:<nonce>:<signature>". The server has the same key, so it
   can check the signature. Each user has a different key: a key copied from
   one phone can only make codes for that one user, never for anyone else.

In both kinds the nonce is a random value that makes each code different. It is
saved when the code is used (used_qr_nonces), so each code works only once. The
same local server creates the keys and checks the codes, so both work without
internet.
"""

import hashlib
import hmac
import re
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_admin
from app.config import settings
from app.database import DbSession
from app.models import User
from app.schemas import PersonalQrKey, QrIssued
from app.security import InvalidTokenError, create_token, verify_token
from app.users import get_user_or_404

router = APIRouter(prefix="/users", tags=["qr codes"], dependencies=[Depends(require_admin)])
# For any logged-in user (members too): only about their own account.
me_router = APIRouter(prefix="/me", tags=["qr codes"])

# A personal code changes every 30 seconds, like an authenticator app.
PERSONAL_QR_STEP_SECONDS = 30
PERSONAL_QR_PREFIX = "P:"
# "P:<user_id>:<step>:<nonce>:<signature>". The nonce uses base64url letters
# (8 to 32 of them) and the signature is SHA-256 in hex (64 characters).
_PERSONAL_QR_PATTERN = re.compile(r"P:(\d{1,10}):(\d{1,12}):([A-Za-z0-9_-]{8,32}):([0-9a-f]{64})")


def create_qr_token(user_id: int) -> str:
    """A new single-use token for this user, valid for settings.qr_ttl_seconds."""
    nonce = secrets.token_urlsafe(16)
    return create_token(f"{user_id}:{nonce}", settings.qr_secret, settings.qr_ttl_seconds)


def read_qr_token(token: str) -> tuple[int, str]:
    """Return (user_id, nonce), or raise InvalidTokenError.

    verify_token checks the signature and the expiry; here we only check that
    the subject has the "<user_id>:<nonce>" shape.
    """
    subject = verify_token(token, settings.qr_secret)
    user_part, separator, nonce = subject.partition(":")
    if not separator or not user_part.isdigit() or not nonce:
        raise InvalidTokenError("malformed")
    return int(user_part), nonce


# --- Personal QR codes ---------------------------------------------------------


def is_personal_qr(text: str) -> bool:
    return text.startswith(PERSONAL_QR_PREFIX)


def personal_qr_signature(key: str, user_id: int, step: int, nonce: str) -> str:
    """HMAC-SHA256 of "<user_id>:<step>:<nonce>" with the user's key, in hex.

    The browser computes exactly the same thing (frontend/src/qr/personalQr.js).
    """
    message = f"{user_id}:{step}:{nonce}"
    return hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest()


def current_step(now: float | None = None) -> int:
    """How many 30-second periods have passed since 1970 (same in the browser)."""
    return int((time.time() if now is None else now) // PERSONAL_QR_STEP_SECONDS)


def read_personal_qr(text: str, db: Session, now: float | None = None) -> tuple[int, str]:
    """Return (user_id, nonce) of a personal code, or raise InvalidTokenError.

    Checks, in order: the shape, the signature with that user's key, and the
    time. Like verify_token, nothing in the text is trusted before the
    signature is checked.
    """
    match = _PERSONAL_QR_PATTERN.fullmatch(text)
    if match is None:
        raise InvalidTokenError("malformed")
    user_id, step, nonce, signature = int(match[1]), int(match[2]), match[3], match[4]

    user = db.get(User, user_id)
    if user is None or user.qr_key is None:
        raise InvalidTokenError("bad_signature")
    expected = personal_qr_signature(user.qr_key, user_id, step, nonce)
    # compare_digest takes the same time whatever the guess is.
    if not hmac.compare_digest(signature, expected):
        raise InvalidTokenError("bad_signature")

    # Accepted: the current period, the previous one (the code was shown just
    # before the change) and the next one (the phone's clock is a bit ahead).
    # So a code lives between 30 and 60 seconds, plus up to 30 s of clock error.
    difference = current_step(now) - step
    if difference > 1:
        raise InvalidTokenError("expired")
    if difference < -1:
        raise InvalidTokenError("not_yet_valid")
    # The prefix keeps these nonces apart from the ones of admin codes.
    return user_id, f"personal:{nonce}"


@me_router.post("/qr-key", response_model=PersonalQrKey)
def create_personal_qr_key(user: CurrentUser, db: DbSession) -> PersonalQrKey:
    """Give the logged-in user a new key for their personal QR codes.

    It replaces the previous key, so codes made with an old key (for example on
    a lost phone) stop working. The browser keeps it until the tab is closed.
    """
    user.qr_key = secrets.token_urlsafe(32)
    db.commit()
    return PersonalQrKey(
        key=user.qr_key, user_id=user.id, step_seconds=PERSONAL_QR_STEP_SECONDS
    )


# --- Codes issued by an admin ----------------------------------------------------


@router.post("/{user_id}/qr", response_model=QrIssued, status_code=status.HTTP_201_CREATED)
def issue_qr(user_id: int, db: DbSession) -> QrIssued:
    """Create a QR code for the user, for example a visitor or someone whose face
    is not recognized. The admin's screen asks for a new one when it expires."""
    user = get_user_or_404(db, user_id)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_inactive")
    return QrIssued(token=create_qr_token(user.id), expires_in=settings.qr_ttl_seconds)
