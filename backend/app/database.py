"""Database connection, sessions and first-time setup (SQLAlchemy 2.0).

SQLite is used locally because it needs no setup. The rest of the code only
talks to SQLAlchemy, so the online demo uses PostgreSQL (Supabase) just by
changing DATABASE_URL.
"""

from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine, func, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Parent class of every table model (see models.py)."""


def normalize_database_url(database_url: str) -> str:
    """Make a PostgreSQL URL use the psycopg (version 3) driver.

    Providers such as Supabase give URLs that start with "postgresql://" (or the
    older "postgres://"). For those, SQLAlchemy would look for the old psycopg2
    driver; "postgresql+psycopg://" tells it to use psycopg 3, which is the one
    in requirements.txt.
    """
    for prefix in ("postgres://", "postgresql://"):
        if database_url.startswith(prefix):
            return "postgresql+psycopg://" + database_url[len(prefix):]
    return database_url


def make_engine(database_url: str, **kwargs) -> Engine:
    """Create an engine with the options each database needs."""
    database_url = normalize_database_url(database_url)
    connect_args = {}
    if database_url.startswith("sqlite"):
        # FastAPI can use a session in a different thread from the one that
        # opened it. SQLite refuses that by default; this turns the check off.
        connect_args["check_same_thread"] = False
    else:
        # A database server may close connections that were idle for a while.
        # pre_ping checks each one before using it and opens a new one if needed.
        kwargs.setdefault("pool_pre_ping", True)
    return create_engine(database_url, connect_args=connect_args, **kwargs)


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed at the end."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Shortcut for endpoint parameters: `db: DbSession`.
DbSession = Annotated[Session, Depends(get_db)]


def init_db(bind: Engine = engine) -> None:
    """Create the tables and the demo admin. Safe to run on every start."""
    # Imported here because models.py imports Base from this module.
    from app.models import ROLE_ADMIN, User
    from app.security import hash_password

    _create_sqlite_folder(bind)
    # Creates missing tables only. It never changes existing tables.
    Base.metadata.create_all(bind)
    _add_new_columns(bind)

    with Session(bind) as db:
        user_count = db.scalar(select(func.count()).select_from(User))
        if user_count == 0:
            if settings.initial_admin_email:
                # Public server: the first admin has no password, so the only way
                # in is SSO with this email. There is no known password to guess.
                admin = User(email=settings.initial_admin_email, name="Admin", role=ROLE_ADMIN)
            else:
                # Local development: a demo admin with a known password.
                admin = User(
                    email="admin@example.com",
                    name="Admin",
                    role=ROLE_ADMIN,
                    password_hash=hash_password("admin123"),
                )
            db.add(admin)
            db.commit()


def _add_new_columns(bind: Engine) -> None:
    """Add the columns that were added to the models after a table was created.

    A small replacement for a migrations tool, enough for this project: it only
    adds columns that may be empty, so the rows that already exist get NULL.
    Renaming or removing a column still needs the SQLite file to be deleted.
    """
    inspector = inspect(bind)
    with bind.begin() as connection:
        for table in Base.metadata.sorted_tables:
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name not in existing and column.nullable:
                    column_type = column.type.compile(dialect=bind.dialect)
                    connection.execute(
                        text(f"ALTER TABLE {table.name} ADD COLUMN {column.name} {column_type}")
                    )


def _create_sqlite_folder(bind: Engine) -> None:
    # SQLite creates the file but not its folder (e.g. backend/data/).
    database = bind.url.database
    if bind.url.get_backend_name() == "sqlite" and database and database != ":memory:":
        Path(database).parent.mkdir(parents=True, exist_ok=True)
