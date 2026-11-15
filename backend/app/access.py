"""Endpoints used by the access point (kiosk).

The kiosk has no user login: it identifies itself with the terminal key in the
X-Terminal-Key header, so it works without SSO and without internet. The
kiosk only sends numbers; the server is the only one that decides who gets in,
and it logs every attempt in access_events.
"""

import hmac
import math
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import DbSession
from app.models import METHOD_FACE, RESULT_DENIED, RESULT_GRANTED, AccessEvent, FaceTemplate, User
from app.schemas import AccessDecision, FaceAccessRequest


def require_terminal(x_terminal_key: Annotated[str | None, Header()] = None) -> None:
    """Dependency: 401 unless the request carries the right terminal key."""
    # compare_digest takes the same time whatever the key is, so the response
    # time does not reveal how much of a guess was right.
    if x_terminal_key is None or not hmac.compare_digest(
        x_terminal_key.encode(), settings.terminal_key.encode()
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_terminal_key")


router = APIRouter(prefix="/access", tags=["access point"], dependencies=[Depends(require_terminal)])


def find_match(
    descriptor: list[float],
    templates: list[tuple[int, list[float]]],
    threshold: float,
    margin: float,
) -> tuple[int | None, float | None]:
    """Decide who this face belongs to. Pure function: easy to test.

    `templates` holds (user_id, descriptor) pairs. Returns (user_id, distance)
    where user_id is None when nobody matches, and distance is the distance to
    the closest face (None when nobody is enrolled).
    """
    if not templates:
        return None, None

    # Euclidean distance: the straight-line distance between two points in a
    # 128-dimensional space. Smaller means more similar faces.
    distances = sorted((math.dist(descriptor, saved), user_id) for user_id, saved in templates)
    best_distance, best_user_id = distances[0]

    if best_distance >= threshold:
        return None, best_distance
    # Two enrolled people almost equally close: do not guess.
    if len(distances) > 1 and distances[1][0] - best_distance < margin:
        return None, best_distance
    return best_user_id, best_distance


def record_access(
    db: Session,
    *,
    method: str,
    direction: str,
    user: User | None,
    distance: float | None = None,
) -> AccessDecision:
    """Log the attempt and build the answer for the kiosk. Used by every method."""
    result = RESULT_GRANTED if user is not None else RESULT_DENIED
    db.add(
        AccessEvent(
            user_id=user.id if user else None,
            method=method,
            result=result,
            direction=direction,
            distance=distance,
        )
    )
    db.commit()
    return AccessDecision(
        result=result,
        user_name=user.name if user else None,
        distance=round(distance, 3) if distance is not None else None,
    )


@router.post("/face", response_model=AccessDecision)
def check_face(body: FaceAccessRequest, db: DbSession) -> AccessDecision:
    """Compare the face with every enrolled face of an active user."""
    rows = db.execute(
        select(FaceTemplate.user_id, FaceTemplate.descriptor)
        .join(User, User.id == FaceTemplate.user_id)
        .where(User.is_active)
    ).all()
    templates = [(user_id, descriptor) for user_id, descriptor in rows]

    user_id, distance = find_match(
        body.descriptor, templates, settings.face_match_threshold, settings.face_match_margin
    )
    user = db.get(User, user_id) if user_id is not None else None
    return record_access(
        db, method=METHOD_FACE, direction=body.direction, user=user, distance=distance
    )
