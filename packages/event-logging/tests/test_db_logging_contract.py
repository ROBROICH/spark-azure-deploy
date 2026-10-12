from __future__ import annotations

import io
import json
import os
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from event_logging.db_logging import setup_db_logging
from event_logging.event_logger import EventLogger
from event_logging.settings import LoggingSettings
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

FIXTURES: dict[str, dict[str, Any]] = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "database" / "events.json").read_text()
)
FIXED_TIMESTAMP = "2026-07-16T00:00:00.000Z"


def _logger(stream: Any) -> EventLogger:
    return EventLogger(
        service_name="database-contract",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
        settings=LoggingSettings(LOG_LEVEL="debug"),
    )


def _events(stream: io.StringIO) -> list[dict[str, Any]]:
    return [json.loads(line) for line in stream.getvalue().splitlines()]


def _assert_stable(event: dict[str, Any], fixture_name: str) -> None:
    expected = FIXTURES[fixture_name]
    assert {key: event.get(key) for key in expected} == expected
    assert event["@timestamp"] == FIXED_TIMESTAMP


def _find(events: list[dict[str, Any]], fixture_name: str) -> dict[str, Any]:
    expected = FIXTURES[fixture_name]
    return next(event for event in events if all(event.get(key) == value for key, value in expected.items()))


class UniqueViolation(sqlite3.IntegrityError):
    pgcode = "23505"


class PsycopgStyleCursor(sqlite3.Cursor):
    def execute(self, sql: str, parameters: Any = (), /) -> sqlite3.Cursor:
        try:
            return super().execute(sql, parameters)
        except sqlite3.IntegrityError as error:
            raise UniqueViolation(
                'duplicate key value violates unique constraint "person_email_key"\n'
                f"DETAIL:  Key (email)=({parameters[0]}) already exists."
            ) from error


class PsycopgStyleConnection(sqlite3.Connection):
    def cursor(self, factory: Any = PsycopgStyleCursor) -> sqlite3.Cursor:
        return super().cursor(factory)


def test_unique_violation_logs_sqlstate_and_operation_without_driver_detail() -> None:
    engine = create_engine(
        "sqlite://",
        creator=lambda: sqlite3.connect(":memory:", factory=PsycopgStyleConnection),
    )
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE person (email TEXT UNIQUE)"))
        connection.execute(text("INSERT INTO person (email) VALUES (:email)"), {"email": "a@b.de"})

    stream = io.StringIO()
    setup_db_logging(engine, "database-contract", logger=_logger(stream))
    with engine.connect() as connection, pytest.raises(IntegrityError) as raised:
        connection.execute(text("INSERT INTO person (email) VALUES (:email)"), {"email": "a@b.de"})
    engine.dispose()

    assert "Key (email)=(a@b.de)" in str(raised.value.orig)
    assert "a@b.de" not in stream.getvalue()
    error_event = _find(_events(stream), "error")
    assert error_event["error.message"] == "UniqueViolation (SQLSTATE 23505)"
    assert error_event["event.code"] == "23505"
    assert "database.query" not in error_event


def test_sqlalchemy_adapter_preserves_database_event_meaning_and_is_observation_only() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"))

    stream = io.StringIO()
    setup_db_logging(engine, "database-contract", logger=_logger(stream))

    sentinel = "bound-value-must-not-enter-statement"
    with Session(engine) as session:
        assert session.execute(text("SELECT id FROM sample WHERE value = :value"), {"value": sentinel}).all() == []
        session.execute(text("INSERT INTO sample (id, value) VALUES (:id, :value)"), {"id": 1, "value": sentinel})
        session.execute(text("UPDATE sample SET value = :value WHERE id = :id"), {"id": 1, "value": "updated"})
        session.execute(text("DELETE FROM sample WHERE id = :id"), {"id": 1})
        session.commit()

    with Session(engine) as session:
        session.execute(text("INSERT INTO sample (id, value) VALUES (:id, :value)"), {"id": 2, "value": "first"})
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(
                text("INSERT INTO sample (id, value) VALUES (:id, :value)"),
                {"id": 2, "value": "duplicate"},
            )
        session.rollback()

    events = _events(stream)
    for fixture_name in ("select", "insert", "update", "delete", "error", "commit", "rollback"):
        _assert_stable(_find(events, fixture_name), fixture_name)

    statement_events = [event for event in events if "database.query" in event]
    assert statement_events
    assert all(sentinel not in event["database.query"] for event in statement_events)
    assert all("parameters" not in event and "result" not in event for event in events)
    assert all(isinstance(event["event.duration"], int) and event["event.duration"] >= 0 for event in statement_events)
    assert isinstance(_find(events, "insert")["database.rows_affected"], int)

    class BrokenStream:
        def write(self, _: str) -> None:
            raise RuntimeError("logging sink unavailable")

    setup_db_logging(engine, "database-contract", logger=_logger(BrokenStream()))
    with Session(engine) as session:
        assert session.execute(text("SELECT 1")).scalar_one() == 1
    engine.dispose()


@pytest.mark.parametrize(
    ("configured_level", "expected_levels"),
    [
        ("INFO", ["error"]),
        ("debug", ["debug", "error"]),
        ("CRITICAL", []),
    ],
)
def test_database_events_respect_configured_log_level(
    monkeypatch: pytest.MonkeyPatch, configured_level: str, expected_levels: list[str]
) -> None:
    monkeypatch.setenv("LOG_LEVEL", configured_level)
    stream = io.StringIO()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE sample (value TEXT UNIQUE)"))
            connection.execute(text("INSERT INTO sample VALUES (:value)"), {"value": "private-bound-value"})
        setup_db_logging(
            engine, "database-contract", logger=EventLogger(service_name="database-contract", stream=stream)
        )
        with engine.connect() as connection:
            assert connection.execute(text("SELECT value FROM sample")).scalar_one() == "private-bound-value"
            with pytest.raises(IntegrityError):
                connection.execute(text("INSERT INTO sample VALUES (:value)"), {"value": "private-bound-value"})
        assert [event["log.level"] for event in _events(stream)] == expected_levels
        assert "private-bound-value" not in stream.getvalue()
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not os.getenv("EVENT_LOGGING_POSTGRES_TEST_URL"),
    reason="set EVENT_LOGGING_POSTGRES_TEST_URL to an externally migrated disposable PostgreSQL database",
)
def test_sqlalchemy_adapter_against_real_postgres() -> None:
    database_url = os.environ["EVENT_LOGGING_POSTGRES_TEST_URL"]
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    elif database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)

    engine = create_engine(database_url)
    stream = io.StringIO()
    setup_db_logging(engine, "database-contract", logger=_logger(stream))
    identifier = uuid4()
    name = f"event-logging-{uuid4()}"

    try:
        with Session(engine) as session:
            assert session.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "d7c4a8f2b6e1"
            session.execute(
                text("INSERT INTO project_type (id, name, created_at, updated_at) VALUES (:id, :name, now(), now())"),
                {"id": identifier, "name": name},
            )
            session.commit()

        with Session(engine) as session:
            assert (
                session.execute(text("SELECT name FROM project_type WHERE id = :id"), {"id": identifier}).scalar_one()
                == name
            )

        with Session(engine) as session:
            with pytest.raises(IntegrityError):
                session.execute(
                    text(
                        "INSERT INTO project_type (id, name, created_at, updated_at) VALUES (:id, :name, now(), now())"
                    ),
                    {"id": identifier, "name": "duplicate"},
                )
            session.rollback()

        events = _events(stream)
        for fixture_name in ("select", "insert", "error", "commit", "rollback"):
            _assert_stable(_find(events, fixture_name), fixture_name)

        assert any("database.query" in event for event in events)
        assert name not in stream.getvalue()
        assert str(identifier) not in stream.getvalue()
        assert _find(events, "error")["event.code"] == "23505"
        password = urlsplit(database_url.replace("postgresql+psycopg://", "postgresql://", 1)).password
        if password:
            assert password not in stream.getvalue()
        assert all("parameters" not in event and "result" not in event for event in events)
    finally:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM project_type WHERE id = :id"), {"id": identifier})
        engine.dispose()
