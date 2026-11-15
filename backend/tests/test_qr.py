import time

from sqlalchemy import select

from app.config import settings
from app.models import AccessEvent
from app.security import create_token
from tests.conftest import auth_header, token_for

TERMINAL = {"X-Terminal-Key": settings.terminal_key}


def issue(client, headers, user_id):
    return client.post(f"/users/{user_id}/qr", headers=headers)


def new_qr(client, admin_headers, user_id) -> str:
    return issue(client, admin_headers, user_id).json()["token"]


def check(client, token: str, direction: str = "in", headers=TERMINAL):
    return client.post("/access/qr", json={"token": token, "direction": direction}, headers=headers)


def logged_events(db) -> list[AccessEvent]:
    db.expire_all()
    return list(db.scalars(select(AccessEvent).order_by(AccessEvent.id)))


# --- Issue (admin) ----------------------------------------------------------


def test_an_admin_gets_a_qr_code_that_lasts_a_minute(client, admin_headers, member):
    response = issue(client, admin_headers, member.id)

    assert response.status_code == 201
    assert response.json()["token"]
    assert response.json()["expires_in"] == settings.qr_ttl_seconds


def test_members_cannot_issue_qr_codes(client, member):
    response = issue(client, auth_header(token_for(member)), member.id)

    assert response.status_code == 403


def test_no_qr_code_for_unknown_or_inactive_users(client, admin_headers, member):
    assert issue(client, admin_headers, 9999).status_code == 404

    client.patch(f"/users/{member.id}", json={"is_active": False}, headers=admin_headers)
    response = issue(client, admin_headers, member.id)

    assert response.status_code == 409
    assert response.json()["detail"] == "user_inactive"


# --- Check (access point) ---------------------------------------------------


def test_a_valid_qr_code_lets_the_user_in_and_is_logged(client, db, admin_headers, member):
    response = check(client, new_qr(client, admin_headers, member.id), direction="out")

    assert response.json() == {
        "result": "granted", "user_name": member.name, "distance": None, "reason": None
    }
    [event] = logged_events(db)
    assert (event.user_id, event.method, event.result, event.direction) == (
        member.id, "qr", "granted", "out"
    )


def test_a_qr_code_works_only_once(client, db, admin_headers, member):
    token = new_qr(client, admin_headers, member.id)
    check(client, token)

    second = check(client, token)

    assert second.json()["result"] == "denied"
    assert second.json()["reason"] == "qr_already_used"
    # The second attempt is also logged, with the user it belongs to.
    assert [(e.user_id, e.result) for e in logged_events(db)] == [
        (member.id, "granted"), (member.id, "denied")
    ]


def test_an_expired_qr_code_is_denied(client, member):
    # Made two minutes ago, valid for one minute.
    token = create_token(f"{member.id}:old-nonce", settings.qr_secret, 60, now=time.time() - 120)

    response = check(client, token)

    assert response.json()["reason"] == "qr_expired"


def test_a_changed_qr_code_is_denied(client, admin_headers, member):
    token = new_qr(client, admin_headers, member.id)
    tampered = ("A" if token[0] != "A" else "B") + token[1:]

    response = check(client, tampered)

    assert response.json()["reason"] == "qr_invalid"


def test_a_login_token_is_not_a_qr_code(client, admin_token):
    # Signed with the login secret, not the QR secret: the signature fails.
    response = check(client, admin_token)

    assert response.json()["reason"] == "qr_invalid"


def test_text_that_is_not_a_qr_token_is_denied(client):
    assert check(client, "hello").json()["reason"] == "qr_invalid"
    # Correctly signed, but without the "<user_id>:<nonce>" shape.
    odd = create_token("no-user-here", settings.qr_secret, 60)
    assert check(client, odd).json()["reason"] == "qr_invalid"


def test_a_user_deactivated_after_getting_the_code_is_denied(client, admin_headers, member):
    token = new_qr(client, admin_headers, member.id)
    client.patch(f"/users/{member.id}", json={"is_active": False}, headers=admin_headers)

    response = check(client, token)

    assert response.json()["reason"] == "user_inactive"


def test_checking_a_qr_code_needs_the_terminal_key(client, admin_headers, member):
    token = new_qr(client, admin_headers, member.id)

    response = check(client, token, headers={})

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_terminal_key"
