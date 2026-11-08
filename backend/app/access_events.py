"""Access log for the admin portal: list the access events. Requires an admin.

Events are written by the access point (face and QR checks, coming next). This
module only reads them, for the history and the reports.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.auth import require_admin
from app.database import DbSession
from app.models import AccessEvent, as_utc
from app.schemas import AccessEventOut

router = APIRouter(
    prefix="/access-events", tags=["access events"], dependencies=[Depends(require_admin)]
)


@router.get("", response_model=list[AccessEventOut])
def list_access_events(
    db: DbSession,
    start: datetime | None = None,
    end: datetime | None = None,
    user_id: int | None = None,
) -> list[AccessEvent]:
    """List events, newest first. Every filter is optional.

    - `start`: only events at or after this moment.
    - `end`: only events before this moment (not included).
    - `user_id`: only events of this user.

    `start` and `end` are exact moments (for example `2026-11-08T00:00:00-03:00`).
    The browser knows the local time zone, so it turns a day into the moments
    where that day starts and ends.
    """
    query = select(AccessEvent).order_by(AccessEvent.created_at.desc(), AccessEvent.id.desc())
    # Dates are stored in UTC, so the limits are compared in UTC too.
    if start is not None:
        query = query.where(AccessEvent.created_at >= as_utc(start))
    if end is not None:
        query = query.where(AccessEvent.created_at < as_utc(end))
    if user_id is not None:
        query = query.where(AccessEvent.user_id == user_id)
    return list(db.scalars(query))
