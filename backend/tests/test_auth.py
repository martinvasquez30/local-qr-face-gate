from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

DEMO_EMAIL = "admin@example.com"
DEMO_PASSWORD = "admin123"


def login(email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_with_valid_credentials_returns_a_token():
    response = login(DEMO_EMAIL, DEMO_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["user"]["email"] == DEMO_EMAIL
    assert body["user"]["role"] == "admin"


def test_login_ignores_email_case_and_spaces():
    response = login("  Admin@Example.COM ", DEMO_PASSWORD)

    assert response.status_code == 200


def test_login_with_wrong_password_is_rejected():
    response = login(DEMO_EMAIL, "wrong-password")

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_login_with_unknown_email_gets_the_same_error():
    response = login("nobody@example.com", DEMO_PASSWORD)

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_me_with_valid_token_returns_the_user():
    token = login(DEMO_EMAIL, DEMO_PASSWORD).json()["access_token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == DEMO_EMAIL


def test_me_without_token_is_rejected():
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_me_with_invalid_token_is_rejected():
    response = client.get("/auth/me", headers={"Authorization": "Bearer not.valid"})

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_token"
