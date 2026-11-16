import pytest
from sqlalchemy import select

from app.access import find_match
from app.config import settings
from app.models import DESCRIPTOR_LENGTH, AccessEvent, FaceTemplate, User

TERMINAL = {"X-Terminal-Key": settings.terminal_key}


def descriptor(value: float) -> list[float]:
    """A made-up descriptor: 128 times the same number."""
    return [value] * DESCRIPTOR_LENGTH


def add_face(db, user: User, value: float) -> None:
    db.add(FaceTemplate(user_id=user.id, descriptor=descriptor(value)))
    db.commit()


def check_face(client, value: float, direction: str = "in", headers=TERMINAL):
    return client.post(
        "/access/face",
        json={"descriptor": descriptor(value), "direction": direction},
        headers=headers,
    )


def logged_events(db) -> list[AccessEvent]:
    db.expire_all()
    return list(db.scalars(select(AccessEvent)))


# --- find_match (the decision rule) -----------------------------------------

THRESHOLD = 0.5
MARGIN = 0.05


def test_nobody_enrolled_means_no_match():
    assert find_match(descriptor(0.1), [], THRESHOLD, MARGIN) == (None, None, "no_faces_enrolled")


def test_a_close_face_matches():
    user_id, distance, reason = find_match(
        descriptor(0.1), [(7, descriptor(0.1))], THRESHOLD, MARGIN
    )

    assert user_id == 7
    assert distance == pytest.approx(0.0)
    assert reason is None


def test_a_face_beyond_the_threshold_does_not_match():
    # Each of the 128 numbers differs by 0.1: distance = sqrt(128 * 0.01) = 1.13.
    user_id, distance, reason = find_match(
        descriptor(0.2), [(7, descriptor(0.1))], THRESHOLD, MARGIN
    )

    assert user_id is None
    assert distance == pytest.approx(1.131, abs=0.001)
    assert reason == "face_no_match"


def test_two_almost_equally_close_people_do_not_match():
    # Both are under the threshold, but only 0.011 apart: not enough margin.
    templates = [(7, descriptor(0.100)), (8, descriptor(0.101))]

    user_id, _, reason = find_match(descriptor(0.100), templates, THRESHOLD, MARGIN)

    assert user_id is None
    assert reason == "face_ambiguous"


def test_the_closest_of_two_clearly_different_people_matches():
    templates = [(7, descriptor(0.10)), (8, descriptor(0.50))]

    user_id, _, _ = find_match(descriptor(0.10), templates, THRESHOLD, MARGIN)

    assert user_id == 7


# --- Terminal key -----------------------------------------------------------


def test_without_the_terminal_key_the_request_is_rejected(client):
    response = check_face(client, 0.1, headers={})

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_terminal_key"


def test_a_wrong_terminal_key_is_rejected(client):
    response = check_face(client, 0.1, headers={"X-Terminal-Key": "wrong"})

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_terminal_key"


# --- POST /access/face ------------------------------------------------------


def test_an_enrolled_person_gets_in_and_the_attempt_is_logged(client, db, member):
    add_face(db, member, 0.1)

    response = check_face(client, 0.1, direction="out")

    assert response.status_code == 200
    assert response.json() == {
        "result": "granted", "user_name": member.name, "distance": 0.0, "reason": None
    }
    [event] = logged_events(db)
    assert (event.user_id, event.method, event.result, event.direction) == (
        member.id, "face", "granted", "out"
    )


def test_an_unknown_face_is_denied_and_logged_without_a_user(client, db, member):
    add_face(db, member, 0.1)

    response = check_face(client, 0.9)

    body = response.json()
    assert body["result"] == "denied"
    assert body["user_name"] is None
    assert body["distance"] > settings.face_match_threshold
    [event] = logged_events(db)
    assert event.user_id is None
    assert event.result == "denied"
    assert event.distance == pytest.approx(body["distance"], abs=0.001)
    assert event.reason == "face_no_match"


def test_the_reason_is_logged_but_not_told_to_the_kiosk(client, db, member):
    # The same face enrolled for two people: the kiosk cannot tell them apart.
    other = User(name="Other", email="other@example.com", role="member")
    db.add(other)
    db.commit()
    add_face(db, member, 0.100)
    add_face(db, other, 0.101)

    response = check_face(client, 0.100)

    assert response.json()["result"] == "denied"
    assert response.json()["reason"] is None
    [event] = logged_events(db)
    assert event.reason == "face_ambiguous"


def test_an_inactive_user_does_not_get_in(client, db, member):
    add_face(db, member, 0.1)
    member.is_active = False
    db.commit()

    response = check_face(client, 0.1)

    assert response.json()["result"] == "denied"


def test_with_nobody_enrolled_the_attempt_is_denied(client, db):
    response = check_face(client, 0.1)

    assert response.json() == {
        "result": "denied", "user_name": None, "distance": None, "reason": None
    }
    assert len(logged_events(db)) == 1


def test_an_invalid_descriptor_is_rejected_with_a_code(client):
    response = client.post(
        "/access/face", json={"descriptor": [0.1] * 10, "direction": "in"}, headers=TERMINAL
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_input"
