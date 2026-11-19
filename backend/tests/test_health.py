from fastapi.testclient import TestClient

from app.main import APP_VERSION, app

client = TestClient(app)


def test_health_check_returns_ok():
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == APP_VERSION
    assert "timestamp" in body


def test_health_check_says_whether_face_recognition_is_on():
    body = client.get("/health").json()

    # On by default (local installation).
    assert body["face_recognition"] is True
