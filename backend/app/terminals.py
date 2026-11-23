"""Access points (kiosks): when each one last talked to the server.

The kiosks are not registered by hand. `touch_terminal` creates or updates a
row on every contact, and admins read the list on the home page to see which
access points are connected.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import DbSession
from app.models import Terminal, as_utc
from app.schemas import TerminalOut

# The kiosk sends a heartbeat every 30 s. After 90 s of silence (three missed
# heartbeats) it is shown as offline.
ONLINE_SECONDS = 90


def touch_terminal(db: Session, location: str, direction: str) -> None:
    """Record that this access point just talked to the server. The caller commits."""
    terminal = db.scalar(
        select(Terminal).where(Terminal.location == location, Terminal.direction == direction)
    )
    if terminal is None:
        terminal = Terminal(location=location, direction=direction)
        db.add(terminal)
    terminal.last_seen_at = datetime.now(timezone.utc)


router = APIRouter(prefix="/terminals", tags=["terminals"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[TerminalOut])
def list_terminals(db: DbSession) -> list[TerminalOut]:
    """Every access point that ever talked to the server, with its status."""
    now = datetime.now(timezone.utc)
    terminals = db.scalars(select(Terminal).order_by(Terminal.location, Terminal.direction))
    result = []
    for terminal in terminals:
        last_seen = as_utc(terminal.last_seen_at)
        seconds = max(0, int((now - last_seen).total_seconds()))
        result.append(
            TerminalOut(
                location=terminal.location,
                direction=terminal.direction,
                last_seen_at=last_seen,
                seconds_since_seen=seconds,
                is_online=seconds < ONLINE_SECONDS,
            )
        )
    return result
