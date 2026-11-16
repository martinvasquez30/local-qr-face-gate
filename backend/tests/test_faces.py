import pytest
from sqlalchemy import func, select

from app.models import DESCRIPTOR_LENGTH, FaceTemplate, User
from tests.conftest import ADMIN_EMAIL, auth_header, token_for


def descriptor(value: float) -> list[float]:
    """A made-up descriptor: 128 times the same number."""
    return [value] * DESCRIPTOR_LENGTH


def enroll(client, headers, user_id, descriptors):
    return client.put(f"/users/{user_id}/face", json={"descriptors": descriptors}, headers=headers)


def face_status(client, headers, user_id):
    return client.get(f"/users/{user_id}/face", headers=headers)


def stored_template(db, user_id) -> FaceTemplate | None:
    db.expire_all()  # Read what the API saved, not an old copy.
    return db.scalar(select(FaceTemplate).where(FaceTemplate.user_id == user_id))


# --- Access control ---------------------------------------------------------


def test_members_cannot_enroll_faces(client, member):
    response = enroll(client, auth_header(token_for(member)), member.id, [descriptor(0.1)])

    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden"


# --- Enroll -----------------------------------------------------------------


def test_a_user_without_a_face_is_not_enrolled(client, admin_headers, member):
    response = face_status(client, admin_headers, member.id)

    assert response.status_code == 200
    assert response.json() == {"enrolled": False, "updated_at": None}


def test_enrolling_stores_the_average_and_never_returns_it(client, db, admin_headers, member):
    response = enroll(client, admin_headers, member.id, [descriptor(0.1), descriptor(0.3)])

    assert response.status_code == 200
    body = response.json()
    assert body["enrolled"] is True
    assert body["updated_at"].endswith("Z")
    assert "descriptor" not in body and "descriptors" not in body

    template = stored_template(db, member.id)
    assert template.descriptor == pytest.approx(descriptor(0.2))
    assert face_status(client, admin_headers, member.id).json()["enrolled"] is True


def test_enrolling_again_replaces_the_face(client, db, admin_headers, member):
    enroll(client, admin_headers, member.id, [descriptor(0.1)])
    enroll(client, admin_headers, member.id, [descriptor(0.5)])

    count = db.scalar(select(func.count()).select_from(FaceTemplate))
    assert count == 1
    assert stored_template(db, member.id).descriptor == pytest.approx(descriptor(0.5))


@pytest.mark.parametrize(
    "descriptors",
    [
        [],  # No capture.
        [descriptor(0.1)] * 6,  # More than 5 captures.
        [[0.1] * 127],  # One number missing.
        [["not a number"] * DESCRIPTOR_LENGTH],
    ],
)
def test_invalid_captures_are_rejected_with_a_code(client, admin_headers, member, descriptors):
    response = enroll(client, admin_headers, member.id, descriptors)

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_input"


def test_unknown_user_returns_404(client, admin_headers):
    response = enroll(client, admin_headers, 9999, [descriptor(0.1)])

    assert response.status_code == 404
    assert response.json()["detail"] == "user_not_found"


def test_a_face_already_enrolled_for_another_user_is_rejected(client, db, admin_headers, member):
    admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
    enroll(client, admin_headers, admin.id, [descriptor(0.10)])

    # 0.001 apart in each number: distance 0.011, far below the threshold.
    response = enroll(client, admin_headers, member.id, [descriptor(0.101)])

    assert response.status_code == 409
    assert response.json()["detail"] == "face_already_enrolled"
    assert stored_template(db, member.id) is None


def test_a_different_face_can_be_enrolled_next_to_another(client, db, admin_headers, member):
    admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
    enroll(client, admin_headers, admin.id, [descriptor(0.1)])

    # Distance 1.13, far above the threshold: clearly another person.
    response = enroll(client, admin_headers, member.id, [descriptor(0.2)])

    assert response.status_code == 200


def test_enrolling_again_is_not_blocked_by_the_old_face(client, admin_headers, member):
    # The user's own earlier face is replaced, not counted as "someone else".
    enroll(client, admin_headers, member.id, [descriptor(0.1)])

    response = enroll(client, admin_headers, member.id, [descriptor(0.1)])

    assert response.status_code == 200


def test_an_inactive_user_cannot_be_enrolled(client, admin_headers, member):
    client.patch(f"/users/{member.id}", json={"is_active": False}, headers=admin_headers)

    response = enroll(client, admin_headers, member.id, [descriptor(0.1)])

    assert response.status_code == 409
    assert response.json()["detail"] == "user_inactive"


# --- Delete -----------------------------------------------------------------


def test_deleting_the_face(client, db, admin_headers, member):
    enroll(client, admin_headers, member.id, [descriptor(0.1)])

    response = client.delete(f"/users/{member.id}/face", headers=admin_headers)

    assert response.status_code == 204
    assert stored_template(db, member.id) is None
    assert face_status(client, admin_headers, member.id).json()["enrolled"] is False


def test_deactivating_a_user_deletes_their_face(client, db, admin_headers, member):
    enroll(client, admin_headers, member.id, [descriptor(0.1)])

    client.patch(f"/users/{member.id}", json={"is_active": False}, headers=admin_headers)

    assert stored_template(db, member.id) is None
