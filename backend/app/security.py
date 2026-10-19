"""Password hashing and signed access tokens.

Only the Python standard library is used, so every step is easy to follow:

- Passwords are hashed with PBKDF2-HMAC-SHA256 and a random salt. Only the hash
  is stored, never the password.
- Access tokens are a JSON payload plus an HMAC-SHA256 signature, with an
  expiry time. It is the same idea as a JWT, without the extra dependency.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time

# OWASP recommendation for PBKDF2-HMAC-SHA256. Each extra iteration makes
# guessing passwords from a leaked hash slower.
PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
HASH_ALGORITHM = "pbkdf2_sha256"


class InvalidTokenError(Exception):
    """The token is malformed, has a wrong signature or has expired."""


# --- Passwords --------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a password with a new random salt.

    The result keeps everything needed to check the password later:
    ``pbkdf2_sha256$<iterations>$<salt hex>$<hash hex>``.
    """
    salt = secrets.token_bytes(SALT_BYTES)
    digest = _pbkdf2(password, salt, PBKDF2_ITERATIONS)
    return f"{HASH_ALGORITHM}${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Check a password against a hash created by ``hash_password``."""
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$")
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        iterations = int(iterations)
    except ValueError:
        return False
    if algorithm != HASH_ALGORITHM:
        return False

    digest = _pbkdf2(password, salt, iterations)
    # Constant-time comparison: the time taken does not reveal how many
    # bytes matched.
    return hmac.compare_digest(digest, expected)


def _pbkdf2(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


# --- Tokens -----------------------------------------------------------------


def create_token(
    subject: str, secret: str, ttl_seconds: int, now: float | None = None
) -> str:
    """Create a signed token for ``subject`` (the user's email).

    Format: ``<payload>.<signature>``, both base64url encoded. The payload is
    readable by anyone; the signature proves the server created it.
    ``now`` can be passed in tests to control the clock.
    """
    issued_at = int(time.time() if now is None else now)
    payload = {"sub": subject, "iat": issued_at, "exp": issued_at + ttl_seconds}
    payload_part = _b64encode(json.dumps(payload, separators=(",", ":")).encode())
    return f"{payload_part}.{_sign(payload_part, secret)}"


def verify_token(token: str, secret: str, now: float | None = None) -> str:
    """Return the token's subject, or raise ``InvalidTokenError``."""
    parts = token.split(".")
    if len(parts) != 2:
        raise InvalidTokenError("malformed")
    payload_part, signature_part = parts

    # Check the signature before reading the payload: an attacker can change
    # the payload, but cannot produce a matching signature without the secret.
    expected_signature = _sign(payload_part, secret)
    if not hmac.compare_digest(signature_part.encode(), expected_signature.encode()):
        raise InvalidTokenError("bad_signature")

    try:
        payload = json.loads(_b64decode(payload_part))
        subject = payload["sub"]
        expires_at = payload["exp"]
    except (ValueError, KeyError, TypeError):
        raise InvalidTokenError("malformed") from None

    current_time = time.time() if now is None else now
    if current_time >= expires_at:
        raise InvalidTokenError("expired")
    return subject


def _sign(payload_part: str, secret: str) -> str:
    signature = hmac.new(secret.encode(), payload_part.encode(), hashlib.sha256)
    return _b64encode(signature.digest())


def _b64encode(data: bytes) -> str:
    # URL-safe alphabet and no "=" padding, so the token fits in a header or URL.
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)
