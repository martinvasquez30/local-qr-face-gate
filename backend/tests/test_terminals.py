from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.models import AccessEvent, Terminal
from tests.conftest import auth_header, token_for

TERMINAL = {"X-Terminal-Key": settings.terminal_key}


def heartbeat(client, location="library", direction="in", headers=TERMINAL):
    return client.post(
        "/access/heartbeat", json={"location": location, "direction": direction}, headers=headers
    )


def terminals(client, headers):
    return client.get("/terminals", headers=headers)


# --- Heartbeat --------------------------------------------------------------


def test_heartbeat_needs_the_terminal_key(client):
    response = heartbeat(client, headers={"X-Terminal-Key": "wrong"})

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_terminal_key"


def test_unknown_place_is_rejected(client):
    response = heartbeat(client, location="kitchen")

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_input"


def test_first_heartbeat_creates_the_terminal_and_later_ones_update_it(client, db):
    assert heartbeat(client).status_code == 204
    assert heartbeat(client).status_code == 204

    db.expire_all()
    rows = list(db.scalars(select(Terminal)))
    assert [(row.location, row.direction) for row in rows] == [("library", "in")]


def test_entry_and_exit_of_one_place_are_two_terminals(client, admin_headers):
    heartbeat(client, direction="in")
    heartbeat(client, direction="out")

    listed = terminals(client, admin_headers).json()
    assert [(t["location"], t["direction"]) for t in listed] == [
        ("library", "in"),
        ("library", "out"),
    ]


# --- List for admins --------------------------------------------------------


def test_only_admins_see_the_terminals(client, member):
    response = terminals(client, auth_header(token_for(member)))

    assert response.status_code == 403


def test_a_terminal_just_seen_is_online(client, admin_headers):
    heartbeat(client, location="physics_lab")

    terminal = terminals(client, admin_headers).json()[0]
    assert terminal["location"] == "physics_lab"
    assert terminal["is_online"] is True
    assert terminal["seconds_since_seen"] < 5
    assert terminal["last_seen_at"].endswith("Z")


def test_a_silent_terminal_is_offline(client, db, admin_headers):
    db.add(
        Terminal(
            location="computer_lab",
            direction="in",
            last_seen_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
    )
    db.commit()

    terminal = terminals(client, admin_headers).json()[0]
    assert terminal["is_online"] is False
    assert terminal["seconds_since_seen"] >= 300


# --- Access checks carry the place -----------------------------------------


def test_a_qr_check_logs_the_place_and_counts_as_a_heartbeat(client, db, admin_headers):
    client.post(
        "/access/qr",
        json={"token": "not-a-real-code", "direction": "out", "location": "auditorium"},
        headers=TERMINAL,
    )

    db.expire_all()
    event = db.scalar(select(AccessEvent))
    assert event.location == "auditorium"
    listed = terminals(client, admin_headers).json()
    assert [(t["location"], t["direction"]) for t in listed] == [("auditorium", "out")]


def test_a_check_without_place_still_works(client, db, admin_headers):
    # Kiosks set up before places existed send no location.
    response = client.post("/access/qr", json={"token": "not-a-real-code"}, headers=TERMINAL)

    assert response.status_code == 200
    db.expire_all()
    assert db.scalar(select(AccessEvent)).location is None
    assert terminals(client, admin_headers).json() == []
