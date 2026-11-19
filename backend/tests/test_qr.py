import time

from sqlalchemy import select

from app.config import settings
from app.models import AccessEvent
from app.qr import PERSONAL_QR_STEP_SECONDS, current_step, personal_qr_signature
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
    assert [(e.user_id, e.result, e.reason) for e in logged_events(db)] == [
        (member.id, "granted", None), (member.id, "denied", "qr_already_used")
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


# --- Personal QR codes (made by the user's device) --------------------------


def get_key(client, user) -> str:
    return client.post("/me/qr-key", headers=auth_header(token_for(user))).json()["key"]


def personal_qr(user_id: int, key: str, step: int | None = None, nonce: str = "nonce-123") -> str:
    """What the browser makes: "P:<user_id>:<step>:<nonce>:<signature>"."""
    step = current_step() if step is None else step
    return f"P:{user_id}:{step}:{nonce}:{personal_qr_signature(key, user_id, step, nonce)}"


def test_any_logged_in_user_gets_a_key_and_the_server_keeps_it(client, db, member):
    response = client.post("/me/qr-key", headers=auth_header(token_for(member)))

    assert response.status_code == 200
    body = response.json()
    assert (body["user_id"], body["step_seconds"]) == (member.id, PERSONAL_QR_STEP_SECONDS)
    db.refresh(member)
    assert member.qr_key == body["key"]


def test_getting_a_key_needs_a_login(client):
    assert client.post("/me/qr-key").status_code == 401


def test_a_code_made_with_the_key_lets_the_user_in_once(client, db, member):
    code = personal_qr(member.id, get_key(client, member))

    first = check(client, code)
    second = check(client, code)

    assert first.json()["result"] == "granted"
    assert first.json()["user_name"] == member.name
    assert second.json()["reason"] == "qr_already_used"
    assert [(e.user_id, e.method, e.result) for e in logged_events(db)] == [
        (member.id, "qr", "granted"), (member.id, "qr", "denied")
    ]


def test_another_nonce_in_the_same_period_is_a_new_code(client, member):
    # The page can show a fresh code at any moment (e.g. to go out right after
    # coming in), without waiting for the next 30-second period.
    key = get_key(client, member)
    check(client, personal_qr(member.id, key, nonce="first-nonce"))

    response = check(client, personal_qr(member.id, key, nonce="second-nonce"))

    assert response.json()["result"] == "granted"


def test_the_previous_and_next_period_are_accepted_for_clock_differences(client, member):
    key = get_key(client, member)
    now = current_step()

    assert check(client, personal_qr(member.id, key, now - 1, "nonce-before")).json()["result"] == "granted"
    assert check(client, personal_qr(member.id, key, now + 1, "nonce-after")).json()["result"] == "granted"


def test_an_old_personal_code_is_expired_and_a_far_future_one_is_invalid(client, member):
    key = get_key(client, member)

    old = check(client, personal_qr(member.id, key, current_step() - 3))
    future = check(client, personal_qr(member.id, key, current_step() + 3))

    assert old.json()["reason"] == "qr_expired"
    assert future.json()["reason"] == "qr_invalid"


def test_a_key_only_works_for_its_own_user(client, db, admin_headers, member):
    # The member signs a code that says it belongs to the admin (user 1).
    key = get_key(client, member)
    admin_id = client.get("/auth/me", headers=admin_headers).json()["id"]

    response = check(client, personal_qr(admin_id, key))

    assert response.json()["reason"] == "qr_invalid"
    # The attempt is logged without a user: the code proves nobody's identity.
    assert logged_events(db)[0].user_id is None


def test_a_new_key_cancels_the_codes_of_the_old_one(client, member):
    old_key = get_key(client, member)
    get_key(client, member)  # For example, the phone was lost.

    response = check(client, personal_qr(member.id, old_key))

    assert response.json()["reason"] == "qr_invalid"


def test_a_user_without_a_key_or_a_changed_code_is_denied(client, member):
    made_up = personal_qr(member.id, "a-key-the-server-never-gave")
    assert check(client, made_up).json()["reason"] == "qr_invalid"

    code = personal_qr(member.id, get_key(client, member))
    changed = code.replace(f"P:{member.id}:", f"P:{member.id}:1", 1)  # Another period.
    assert check(client, changed).json()["reason"] == "qr_invalid"
    assert check(client, "P:not-a-code").json()["reason"] == "qr_invalid"


def test_a_deactivated_user_cannot_use_a_personal_code(client, admin_headers, member):
    code = personal_qr(member.id, get_key(client, member))
    client.patch(f"/users/{member.id}", json={"is_active": False}, headers=admin_headers)

    response = check(client, code)

    assert response.json()["reason"] == "user_inactive"


def test_the_signature_matches_a_fixed_example():
    # The browser's Web Crypto (frontend/src/qr/personalQr.js, sign) gives this
    # same value for this example, so both sides sign the same text the same way.
    assert personal_qr_signature("test-key", 7, 100, "abcdefgh") == (
        "3feb80a7acc65305deb7dc0860e2c10cb3e8e4f026529db38d3b25c47f991549"
    )
