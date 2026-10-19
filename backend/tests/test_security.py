import base64
import json

import pytest

from app.security import (
    InvalidTokenError,
    create_token,
    hash_password,
    verify_password,
    verify_token,
)

SECRET = "test-secret"


def test_hashed_password_verifies():
    stored_hash = hash_password("correct horse")

    assert verify_password("correct horse", stored_hash)


def test_wrong_password_does_not_verify():
    stored_hash = hash_password("correct horse")

    assert not verify_password("wrong horse", stored_hash)


def test_same_password_gets_a_different_hash_each_time():
    # A random salt means two users with the same password get different hashes.
    assert hash_password("same") != hash_password("same")


def test_token_round_trip_returns_the_subject():
    token = create_token("user@example.com", SECRET, ttl_seconds=60)

    assert verify_token(token, SECRET) == "user@example.com"


def test_token_signed_with_another_secret_is_rejected():
    token = create_token("user@example.com", "another-secret", ttl_seconds=60)

    with pytest.raises(InvalidTokenError):
        verify_token(token, SECRET)


def test_tampered_token_is_rejected():
    token = create_token("user@example.com", SECRET, ttl_seconds=60)
    payload_part, signature_part = token.split(".")

    # Change who the token belongs to, but keep the original signature.
    payload = json.loads(base64.urlsafe_b64decode(payload_part + "=="))
    payload["sub"] = "attacker@example.com"
    forged_payload = base64.urlsafe_b64encode(json.dumps(payload).encode())
    forged_token = forged_payload.decode().rstrip("=") + "." + signature_part

    with pytest.raises(InvalidTokenError):
        verify_token(forged_token, SECRET)


def test_expired_token_is_rejected():
    token = create_token("user@example.com", SECRET, ttl_seconds=60, now=1_000)

    assert verify_token(token, SECRET, now=1_059) == "user@example.com"
    with pytest.raises(InvalidTokenError):
        verify_token(token, SECRET, now=1_060)


def test_malformed_input_is_rejected():
    for bad_token in ["", "no-dot", "a.b.c", "payload.signature"]:
        with pytest.raises(InvalidTokenError):
            verify_token(bad_token, SECRET)

    for bad_hash in ["", "not-a-hash", "md5$1$00$00", "pbkdf2_sha256$x$zz$zz"]:
        assert not verify_password("anything", bad_hash)
