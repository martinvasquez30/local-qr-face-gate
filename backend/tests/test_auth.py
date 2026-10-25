from sqlalchemy import select

from app.models import User
from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD, auth_header, token_for


def login(client, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def deactivate(db, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email))
    user.is_active = False
    db.commit()


def test_login_with_valid_credentials_returns_a_token(client):
    response = login(client, ADMIN_EMAIL, ADMIN_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"]["role"] == "admin"
    assert body["user"]["is_active"] is True
    assert "password_hash" not in body["user"]


def test_login_ignores_email_case_and_spaces(client):
    response = login(client, "  Admin@Example.COM ", ADMIN_PASSWORD)

    assert response.status_code == 200


def test_login_with_wrong_password_is_rejected(client):
    response = login(client, ADMIN_EMAIL, "wrong-password")

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_login_with_unknown_email_gets_the_same_error(client):
    response = login(client, "nobody@example.com", ADMIN_PASSWORD)

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_inactive_admin_cannot_log_in(client, db):
    deactivate(db, ADMIN_EMAIL)

    response = login(client, ADMIN_EMAIL, ADMIN_PASSWORD)

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_member_without_password_cannot_log_in(client, member):
    response = login(client, member.email, "")

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_me_with_valid_token_returns_the_user(client, admin_token):
    response = client.get("/auth/me", headers=auth_header(admin_token))

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == ADMIN_EMAIL
    assert body["is_active"] is True
    assert isinstance(body["id"], int)


def test_me_without_token_is_rejected(client):
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_me_with_invalid_token_is_rejected(client):
    response = client.get("/auth/me", headers=auth_header("not.valid"))

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_token"


def test_token_of_a_deleted_user_is_rejected(client, db, member):
    token = token_for(member)
    db.delete(member)
    db.commit()

    response = client.get("/auth/me", headers=auth_header(token))

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_token"


def test_user_deactivated_after_login_is_rejected(client, db, admin_token):
    deactivate(db, ADMIN_EMAIL)

    response = client.get("/auth/me", headers=auth_header(admin_token))

    assert response.status_code == 401
    assert response.json()["detail"] == "inactive_user"
