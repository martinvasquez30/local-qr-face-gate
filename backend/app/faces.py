"""Face enrollment for the admin portal. Every endpoint requires an admin.

The browser sends face descriptors (lists of 128 numbers), never photos. The
server stores one template per user, and no endpoint ever sends the numbers
back: only whether the user has a face enrolled.
"""

import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.config import settings
from app.database import DbSession
from app.models import FaceTemplate
from app.schemas import FaceEnroll, FaceStatus
from app.users import get_user_or_404

def require_face_recognition() -> None:
    """Dependency: 403 when face recognition is turned off (the online demo).

    Used by the endpoints that receive face descriptors, so no biometric data
    reaches a server where FACE_RECOGNITION_ENABLED is false.
    """
    if not settings.face_recognition_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="face_recognition_disabled"
        )


router = APIRouter(prefix="/users", tags=["faces"], dependencies=[Depends(require_admin)])


def average(descriptors: list[list[float]]) -> list[float]:
    """Average position by position: the first numbers together, and so on.

    Several captures with small differences (light, angle) give a more stable
    template than a single one.
    """
    return [sum(values) / len(values) for values in zip(*descriptors)]


def is_enrolled_for_someone_else(db: Session, user_id: int, descriptor: list[float]) -> bool:
    """True if this face is already saved for another user.

    "Already saved" means what the access point would call a match: closer than
    the threshold. If the same face belonged to two users, the access point
    could never tell them apart and would turn that person away every time.
    """
    others = db.scalars(select(FaceTemplate.descriptor).where(FaceTemplate.user_id != user_id))
    return any(math.dist(descriptor, saved) < settings.face_match_threshold for saved in others)


@router.get("/{user_id}/face", response_model=FaceStatus)
def get_face_status(user_id: int, db: DbSession) -> FaceStatus:
    """Whether the user has a face enrolled, and since when."""
    get_user_or_404(db, user_id)
    template = db.scalar(select(FaceTemplate).where(FaceTemplate.user_id == user_id))
    if template is None:
        return FaceStatus(enrolled=False)
    return FaceStatus(enrolled=True, updated_at=template.created_at)


@router.put(
    "/{user_id}/face",
    response_model=FaceStatus,
    dependencies=[Depends(require_face_recognition)],
)
def enroll_face(user_id: int, body: FaceEnroll, db: DbSession) -> FaceStatus:
    """Save the user's face (the average of the captures). Replaces any earlier one."""
    user = get_user_or_404(db, user_id)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_inactive")

    descriptor = average(body.descriptors)
    if is_enrolled_for_someone_else(db, user.id, descriptor):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="face_already_enrolled")

    db.execute(delete(FaceTemplate).where(FaceTemplate.user_id == user.id))
    template = FaceTemplate(user_id=user.id, descriptor=descriptor)
    db.add(template)
    db.commit()
    db.refresh(template)
    return FaceStatus(enrolled=True, updated_at=template.created_at)


@router.delete("/{user_id}/face", status_code=status.HTTP_204_NO_CONTENT)
def delete_face(user_id: int, db: DbSession) -> None:
    """Delete the user's face. The user can still get in with a QR code."""
    get_user_or_404(db, user_id)
    db.execute(delete(FaceTemplate).where(FaceTemplate.user_id == user_id))
    db.commit()
