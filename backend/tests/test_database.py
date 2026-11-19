import dataclasses

from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool

from app import database
from app.config import settings
from app.database import init_db, make_engine, normalize_database_url


def column_names(engine, table: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table)}


def test_a_column_added_to_a_model_is_added_to_an_old_database():
    engine = make_engine("sqlite://", poolclass=StaticPool)
    # An access_events table as it was before the "reason" column, with one row.
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE access_events (id INTEGER PRIMARY KEY, user_id INTEGER,"
            " method VARCHAR(10), result VARCHAR(10), direction VARCHAR(3),"
            " distance FLOAT, created_at DATETIME)"
        ))
        connection.execute(text(
            "INSERT INTO access_events (method, result, direction) VALUES ('qr', 'granted', 'in')"
        ))

    init_db(engine)

    assert "reason" in column_names(engine, "access_events")
    with engine.connect() as connection:
        # The old row is kept, with an empty reason.
        rows = connection.execute(text("SELECT method, reason FROM access_events")).all()
    assert rows == [("qr", None)]
    engine.dispose()


def test_running_it_again_changes_nothing():
    engine = make_engine("sqlite://", poolclass=StaticPool)
    init_db(engine)
    before = column_names(engine, "access_events")

    init_db(engine)

    assert column_names(engine, "access_events") == before
    engine.dispose()


# --- First admin --------------------------------------------------------------


def test_an_empty_database_gets_the_demo_admin_by_default():
    engine = make_engine("sqlite://", poolclass=StaticPool)

    init_db(engine)

    with engine.connect() as connection:
        rows = connection.execute(text("SELECT email, role, password_hash FROM users")).all()
    assert len(rows) == 1
    email, role, password_hash = rows[0]
    assert (email, role) == ("admin@example.com", "admin")
    assert password_hash is not None


def test_with_initial_admin_email_the_first_admin_has_no_password(monkeypatch):
    monkeypatch.setattr(
        database,
        "settings",
        dataclasses.replace(settings, initial_admin_email="Owner@Example.com"),
    )
    engine = make_engine("sqlite://", poolclass=StaticPool)

    init_db(engine)

    with engine.connect() as connection:
        rows = connection.execute(text("SELECT email, role, password_hash FROM users")).all()
    # Only this admin, stored in lowercase, without a password: SSO is the only way in.
    assert rows == [("owner@example.com", "admin", None)]


def test_postgres_urls_use_the_psycopg_driver():
    assert normalize_database_url("postgresql://u:p@host:5432/db") == (
        "postgresql+psycopg://u:p@host:5432/db"
    )
    assert normalize_database_url("postgres://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    # Other URLs do not change.
    assert normalize_database_url("sqlite:///./data/app.db") == "sqlite:///./data/app.db"
    assert normalize_database_url("postgresql+psycopg://h/db") == "postgresql+psycopg://h/db"
