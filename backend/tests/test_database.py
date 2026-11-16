from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool

from app.database import init_db, make_engine


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
