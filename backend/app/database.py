"""Database connection, sessions and first-time setup (SQLAlchemy 2.0).

SQLite is used in development because it needs no setup. The rest of the code
only talks to SQLAlchemy, so moving to PostgreSQL means changing DATABASE_URL.
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


def make_engine(database_url: str, **kwargs) -> Engine:
    """Create an engine with the options SQLite needs."""
    connect_args = {}
    if database_url.startswith("sqlite"):
        # FastAPI can use a session in a different thread from the one that
        # opened it. SQLite refuses that by default; this turns the check off.
        connect_args["check_same_thread"] = False
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
            db.add(
                User(
                    email="admin@example.com",
                    name="Admin",
                    role=ROLE_ADMIN,
                    password_hash=hash_password("admin123"),
                )
            )
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
