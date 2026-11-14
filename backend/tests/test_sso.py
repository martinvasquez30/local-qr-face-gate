"""SSO tests. No real provider is called: the answer of the provider is faked."""

import dataclasses
from urllib.parse import parse_qs, urlsplit

import pytest

from app import auth
from app.config import settings
from tests.conftest import ADMIN_EMAIL, auth_header

FRONTEND = "http://frontend.test"


@pytest.fixture
def sso_on(monkeypatch):
    """SSO turned on with a made-up client id."""
    monkeypatch.setattr(
        auth, "settings", dataclasses.replace(settings, sso_client_id="test-client", frontend_url=FRONTEND)
    )


def fake_provider(monkeypatch, claims: dict) -> None:
    """Make the provider answer the sign-in with these identity claims."""

    async def authorize_access_token(_request):
        return {"userinfo": claims}

    monkeypatch.setattr(auth.oauth.sso, "authorize_access_token", authorize_access_token)


def callback(client, query: str = ""):
    # follow_redirects=False: we check where the browser is sent, without going there.
    return client.get("/auth/sso/callback" + query, follow_redirects=False)


def fragment(response) -> dict:
    """The values after "#" in the redirect, e.g. {"token": "..."}."""
    location = response.headers["location"]
    assert location.startswith(FRONTEND + "/#")
    return {key: values[0] for key, values in parse_qs(urlsplit(location).fragment).items()}


# --- find_sso_admin ---------------------------------------------------------


def test_an_active_admin_is_found_ignoring_case_and_spaces(db):
    user = auth.find_sso_admin(db, "  Admin@Example.COM ")

    assert user is not None
    assert user.email == ADMIN_EMAIL


def test_unknown_emails_members_and_inactive_admins_are_not_found(db, member):
    assert auth.find_sso_admin(db, "nobody@example.com") is None
    assert auth.find_sso_admin(db, member.email) is None

    admin = auth.find_sso_admin(db, ADMIN_EMAIL)
    admin.is_active = False
    db.commit()
    assert auth.find_sso_admin(db, ADMIN_EMAIL) is None


# --- /auth/sso/login --------------------------------------------------------


def test_login_without_sso_configured_goes_back_with_an_error(client, monkeypatch):
    monkeypatch.setattr(
        auth, "settings", dataclasses.replace(settings, sso_client_id="", frontend_url=FRONTEND)
    )

    response = client.get("/auth/sso/login", follow_redirects=False)

    assert response.status_code == 307
    assert fragment(response) == {"error": "sso_not_configured"}


# --- /auth/sso/callback -----------------------------------------------------


def test_an_admin_gets_a_token_that_works_with_the_api(client, sso_on, monkeypatch):
    fake_provider(monkeypatch, {"email": ADMIN_EMAIL, "email_verified": True})

    response = callback(client)

    token = fragment(response)["token"]
    me = client.get("/auth/me", headers=auth_header(token))
    assert me.status_code == 200
    assert me.json()["email"] == ADMIN_EMAIL


def test_preferred_username_is_used_when_there_is_no_email(client, sso_on, monkeypatch):
    fake_provider(monkeypatch, {"preferred_username": ADMIN_EMAIL})

    response = callback(client)

    assert "token" in fragment(response)


def test_a_member_is_not_allowed(client, sso_on, monkeypatch, member):
    fake_provider(monkeypatch, {"email": member.email, "email_verified": True})

    response = callback(client)

    assert fragment(response) == {"error": "sso_not_allowed"}


def test_an_unverified_email_is_not_allowed(client, sso_on, monkeypatch):
    fake_provider(monkeypatch, {"email": ADMIN_EMAIL, "email_verified": False})

    response = callback(client)

    assert fragment(response) == {"error": "sso_not_allowed"}


def test_an_error_from_the_provider_goes_back_with_an_error(client, sso_on):
    # For example, the user pressed "Cancel" on the provider's page.
    response = callback(client, "?error=access_denied")

    assert fragment(response) == {"error": "sso_failed"}


def test_an_answer_this_browser_did_not_ask_for_is_rejected(client, sso_on):
    # The "state" is not the one saved before going to the provider.
    response = callback(client, "?code=some-code&state=unknown-state")

    assert fragment(response) == {"error": "sso_failed"}
