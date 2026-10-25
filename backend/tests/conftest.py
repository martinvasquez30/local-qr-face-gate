"""Shared pytest fixtures.

Each test gets its own empty in-memory SQLite database (with the demo admin
seeded), so tests never touch backend/data/app.db and cannot affect each other.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import get_db, init_db, make_engine
from app.main import app
from app.models import ROLE_MEMBER, User
from app.security import create_token

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def token_for(user: User) -> str:
    """Token for any user, even one that cannot log in (e.g. a member)."""
    return create_token(str(user.id), settings.token_secret, ttl_seconds=60)


@pytest.fixture
def db_engine() -> Iterator[Engine]:
    # "sqlite://" is an in-memory database. It normally lives only as long as
    # one connection; StaticPool reuses a single connection so every session
    # in the test sees the same data.
    engine = make_engine("sqlite://", poolclass=StaticPool)
    init_db(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(db_engine: Engine) -> Iterator[Session]:
    """Session for preparing or checking data directly in the database."""
    with Session(db_engine) as session:
        yield session


@pytest.fixture
def client(db_engine: Engine) -> Iterator[TestClient]:
    TestSessionLocal = sessionmaker(bind=db_engine)

    def get_test_db() -> Iterator[Session]:
        session = TestSessionLocal()
        try:
            yield session
        finally:
            session.close()

    # Every endpoint that asks for get_db receives the test database instead.
    app.dependency_overrides[get_db] = get_test_db
    # Not used as a context manager (`with TestClient(...)`), so the app's
    # lifespan does not run and the real database is never created.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def admin_token(client: TestClient) -> str:
    response = client.post(
        "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    return response.json()["access_token"]


@pytest.fixture
def member(db: Session) -> User:
    user = User(name="Member", email="member@example.com", role=ROLE_MEMBER)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
