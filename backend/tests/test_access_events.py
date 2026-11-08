from datetime import datetime, timezone

from app.models import (
    DIRECTION_IN,
    METHOD_FACE,
    METHOD_QR,
    RESULT_DENIED,
    RESULT_GRANTED,
    AccessEvent,
)
from tests.conftest import auth_header, token_for


def utc(day: int, hour: int, minute: int = 0) -> datetime:
    """A moment in November 2026, in UTC."""
    return datetime(2026, 11, day, hour, minute, tzinfo=timezone.utc)


def add_event(db, created_at, user_id=None, method=METHOD_FACE, result=RESULT_GRANTED,
              distance=None) -> AccessEvent:
    """Write an event directly in the database, as the access point will do."""
    event = AccessEvent(
        user_id=user_id,
        method=method,
        result=result,
        direction=DIRECTION_IN,
        distance=distance,
        created_at=created_at,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_events(client, headers, **filters):
    return client.get("/access-events", params=filters, headers=headers)


def ids(response) -> list[int]:
    return [event["id"] for event in response.json()]


# --- Access control ---------------------------------------------------------


def test_access_events_require_a_token(client):
    response = client.get("/access-events")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_members_are_forbidden(client, member):
    response = list_events(client, auth_header(token_for(member)))

    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden"


# --- Listing ----------------------------------------------------------------


def test_list_is_empty_when_there_are_no_events(client, admin_headers):
    response = list_events(client, admin_headers)

    assert response.status_code == 200
    assert response.json() == []


def test_events_are_listed_newest_first(client, db, admin_headers, member):
    oldest = add_event(db, utc(8, 10), user_id=member.id, distance=0.35)
    newest = add_event(db, utc(8, 12), method=METHOD_QR, result=RESULT_DENIED)
    middle = add_event(db, utc(8, 11), user_id=member.id)

    response = list_events(client, admin_headers)

    assert response.status_code == 200
    assert ids(response) == [newest.id, middle.id, oldest.id]

    first = response.json()[0]
    assert first["user_id"] is None  # Nobody was recognized.
    assert first["method"] == "qr"
    assert first["result"] == "denied"
    assert first["direction"] == "in"
    assert first["distance"] is None
    # Marked as UTC ("Z"), so the browser can show it in local time.
    assert first["created_at"] == "2026-11-08T12:00:00Z"
    assert response.json()[2]["distance"] == 0.35


# --- Filters ----------------------------------------------------------------


def test_filter_by_user(client, db, admin_headers, member):
    mine = add_event(db, utc(8, 10), user_id=member.id)
    add_event(db, utc(8, 11), user_id=None)

    response = list_events(client, admin_headers, user_id=member.id)

    assert ids(response) == [mine.id]


def test_start_is_included_and_end_is_not(client, db, admin_headers):
    add_event(db, utc(8, 2, 59))
    at_start = add_event(db, utc(8, 3, 0))
    inside = add_event(db, utc(8, 3, 59))
    add_event(db, utc(8, 4, 0))

    response = list_events(
        client, admin_headers, start="2026-11-08T03:00:00Z", end="2026-11-08T04:00:00Z"
    )

    assert ids(response) == [inside.id, at_start.id]


def test_limits_with_a_time_zone_are_compared_in_utc(client, db, admin_headers):
    # The day Nov 8 in Chile (UTC-3) goes from Nov 8 03:00 to Nov 9 03:00 in UTC.
    add_event(db, utc(8, 2, 30))  # Nov 7, 23:30 in Chile: the day before.
    evening = add_event(db, utc(9, 1, 0))  # Nov 8, 22:00 in Chile: inside.
    add_event(db, utc(9, 3, 30))  # Nov 9, 00:30 in Chile: the day after.

    response = list_events(
        client,
        admin_headers,
        start="2026-11-08T00:00:00-03:00",
        end="2026-11-09T00:00:00-03:00",
    )

    assert ids(response) == [evening.id]


def test_filters_can_be_combined(client, db, admin_headers, member):
    add_event(db, utc(7, 10), user_id=member.id)  # Right user, wrong day.
    add_event(db, utc(8, 10), user_id=None)  # Right day, wrong user.
    match = add_event(db, utc(8, 11), user_id=member.id)

    response = list_events(
        client,
        admin_headers,
        user_id=member.id,
        start="2026-11-08T00:00:00Z",
        end="2026-11-09T00:00:00Z",
    )

    assert ids(response) == [match.id]


def test_invalid_date_is_rejected_with_a_code(client, admin_headers):
    response = list_events(client, admin_headers, start="yesterday")

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_input"
