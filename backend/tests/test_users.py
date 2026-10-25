import pytest

from tests.conftest import ADMIN_EMAIL, auth_header, token_for


@pytest.fixture
def admin_headers(admin_token):
    return auth_header(admin_token)


def create(client, headers, name="Ana", email="ana@example.com", role="member"):
    return client.post(
        "/users", json={"name": name, "email": email, "role": role}, headers=headers
    )


def emails(response) -> list[str]:
    return [user["email"] for user in response.json()]


# --- Access control ---------------------------------------------------------


def test_users_api_requires_a_token(client):
    response = client.get("/users")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_members_are_forbidden(client, member):
    response = client.get("/users", headers=auth_header(token_for(member)))

    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden"


# --- Create and list --------------------------------------------------------


def test_created_user_appears_in_the_list(client, admin_headers):
    response = create(client, admin_headers, name="  Ana  ", email=" Ana@Example.com ")

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Ana"
    assert created["email"] == "ana@example.com"
    assert created["role"] == "member"
    assert created["is_active"] is True

    listed = client.get("/users", headers=admin_headers)
    assert "ana@example.com" in emails(listed)


def test_list_is_ordered_by_name(client, admin_headers):
    create(client, admin_headers, name="zoe", email="zoe@example.com")
    create(client, admin_headers, name="Bruno", email="bruno@example.com")

    response = client.get("/users", headers=admin_headers)

    names = [user["name"] for user in response.json()]
    assert names == ["Admin", "Bruno", "zoe"]


def test_duplicate_email_with_different_case_is_rejected(client, admin_headers):
    create(client, admin_headers, email="ana@example.com")

    response = create(client, admin_headers, email="ANA@example.com")

    assert response.status_code == 409
    assert response.json()["detail"] == "email_already_exists"


@pytest.mark.parametrize(
    "body",
    [
        {"name": "Ana", "email": "not-an-email"},
        {"name": "   ", "email": "ana@example.com"},
        {"name": "Ana", "email": "ana@example.com", "role": "superuser"},
    ],
)
def test_invalid_input_is_rejected_with_a_code(client, admin_headers, body):
    response = client.post("/users", json=body, headers=admin_headers)

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_input"
    assert response.json()["errors"]


# --- Get and update ---------------------------------------------------------


def test_get_user_by_id(client, admin_headers, member):
    response = client.get(f"/users/{member.id}", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["email"] == member.email


def test_unknown_user_id_returns_404(client, admin_headers):
    get_response = client.get("/users/9999", headers=admin_headers)
    patch_response = client.patch(
        "/users/9999", json={"name": "X"}, headers=admin_headers
    )

    assert get_response.status_code == 404
    assert get_response.json()["detail"] == "user_not_found"
    assert patch_response.status_code == 404


def test_deactivated_user_is_hidden_unless_inactive_are_included(
    client, admin_headers, member
):
    response = client.patch(
        f"/users/{member.id}", json={"is_active": False}, headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    default_list = client.get("/users", headers=admin_headers)
    full_list = client.get("/users?include_inactive=true", headers=admin_headers)
    assert member.email not in emails(default_list)
    assert member.email in emails(full_list)


def test_deactivated_user_can_be_reactivated(client, admin_headers, member):
    url = f"/users/{member.id}"
    client.patch(url, json={"is_active": False}, headers=admin_headers)

    response = client.patch(url, json={"is_active": True}, headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["is_active"] is True
    assert member.email in emails(client.get("/users", headers=admin_headers))


def test_update_changes_only_the_fields_sent(client, admin_headers, member):
    response = client.patch(
        f"/users/{member.id}", json={"name": "New Name"}, headers=admin_headers
    )

    body = response.json()
    assert body["name"] == "New Name"
    assert body["role"] == "member"
    assert body["is_active"] is True


def test_admin_cannot_deactivate_themselves(client, admin_headers):
    me = client.get("/auth/me", headers=admin_headers).json()

    response = client.patch(
        f"/users/{me['id']}", json={"is_active": False}, headers=admin_headers
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "cannot_modify_self"


def test_admin_cannot_remove_their_own_admin_role(client, admin_headers):
    me = client.get("/auth/me", headers=admin_headers).json()

    response = client.patch(
        f"/users/{me['id']}", json={"role": "member"}, headers=admin_headers
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "cannot_modify_self"


def test_admin_can_rename_themselves(client, admin_headers):
    me = client.get("/auth/me", headers=admin_headers).json()

    response = client.patch(
        f"/users/{me['id']}", json={"name": "Main Admin"}, headers=admin_headers
    )

    assert response.status_code == 200
    assert response.json()["email"] == ADMIN_EMAIL
