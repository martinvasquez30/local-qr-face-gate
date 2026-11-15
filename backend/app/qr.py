"""Dynamic QR codes.

A QR code holds a signed token, made with the same create_token as the login
token but with its own secret (settings.qr_secret), so a QR code can never be
used to log in. Its subject is "<user_id>:<nonce>": the nonce is a random value
that makes each code different, and it is saved when the code is used, so each
code works only once. The same local server creates and checks the codes, so
both work without internet.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import require_admin
from app.config import settings
from app.database import DbSession
from app.schemas import QrIssued
from app.security import InvalidTokenError, create_token, verify_token
from app.users import get_user_or_404

router = APIRouter(prefix="/users", tags=["qr codes"], dependencies=[Depends(require_admin)])


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


@router.post("/{user_id}/qr", response_model=QrIssued, status_code=status.HTTP_201_CREATED)
def issue_qr(user_id: int, db: DbSession) -> QrIssued:
    """Create a QR code for the user, for example a visitor or someone whose face
    is not recognized. The admin's screen asks for a new one when it expires."""
    user = get_user_or_404(db, user_id)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_inactive")
    return QrIssued(token=create_qr_token(user.id), expires_in=settings.qr_ttl_seconds)
