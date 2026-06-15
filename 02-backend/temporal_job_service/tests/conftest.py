"""Shared pytest fixtures."""

import asyncio
import contextlib
import os
import socket
import subprocess
import time
from collections.abc import AsyncIterator

import asyncpg  # type: ignore[import-untyped]
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

os.environ["AUTH_MODE"] = "disabled"
# Provide dummy DB env vars so database.py can construct its module-level engine
# without real credentials.  Integration tests override the session via
# dependency_overrides, so the engine URL here is never actually used.
os.environ.setdefault("DB__USER", "test")
os.environ.setdefault("DB__PASSWORD", "test")
os.environ.setdefault("DB__NAME", "test")
os.environ.setdefault("DB__HOST", "localhost")
# Temporal settings are required by Settings() validation; tests stub the
# Temporal client so these values are never connected to.
os.environ.setdefault("TEMPORAL__HOST", "localhost:7233")
os.environ.setdefault("TEMPORAL__TASK_QUEUE", "test-queue")
os.environ.setdefault("TEMPORAL__S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("TEMPORAL__S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("TEMPORAL__S3_ACCESS_KEY_ID", "test")
os.environ.setdefault("TEMPORAL__S3_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("TEMPORAL__S3_REGION", "eu-west-1")
os.environ.setdefault("TEMPORAL__S3_ARCHIVAL_BUCKET_NAME", "test-archival")
os.environ["SKIP_DOTENV"] = "1"


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Auto-mark tests that require a real Postgres (via ``pg_dsn``/``db_session``)
    as ``integration`` so they are excluded by the default ``-m 'not integration'``
    selector when Docker is unavailable (e.g. in the Jenkins CI environment).
    """
    db_fixtures = {"pg_dsn", "db_session"}
    integration_marker = pytest.mark.integration
    for item in items:
        fixturenames = getattr(item, "fixturenames", ())
        if db_fixtures.intersection(fixturenames):
            item.add_marker(integration_marker)


def _free_port() -> int:
    with contextlib.closing(socket.socket()) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest_asyncio.fixture(scope="session")
async def pg_dsn() -> AsyncIterator[str]:
    """Start an ephemeral Postgres container for the test session."""
    port = _free_port()
    name = f"pg-tjs-test-{port}"
    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-d",
            "--name",
            name,
            "-e",
            "POSTGRES_PASSWORD=pw",
            "-e",
            "POSTGRES_USER=u",
            "-e",
            "POSTGRES_DB=tjs",
            "-p",
            f"{port}:5432",
            "postgres:16",
        ],
        check=True,
    )
    dsn = f"postgresql+asyncpg://u:pw@localhost:{port}/tjs"
    # Wait for readiness
    deadline = time.time() + 30
    last_err: Exception | None = None
    while time.time() < deadline:
        try:
            engine = create_async_engine(dsn)
            async with engine.begin() as conn:
                await conn.run_sync(lambda c: None)
            await engine.dispose()
            break
        except Exception as e:
            last_err = e
            await asyncio.sleep(0.5)
    else:
        subprocess.run(["docker", "rm", "-f", name], check=False)
        raise RuntimeError(f"Postgres never ready: {last_err}")
    try:
        yield dsn
    finally:
        subprocess.run(["docker", "rm", "-f", name], check=False)


async def _run_ddl(pg_dsn: str, statements: list[str]) -> None:
    """Execute DDL via asyncpg's simple-query protocol.

    asyncpg's .execute() uses the simple query protocol, which does NOT
    do prepared-statement type-checking on string literals in WHERE clauses.
    This avoids ``InvalidTextRepresentationError`` when creating partial
    indexes with enum literal comparisons.
    """
    raw_dsn = pg_dsn.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(raw_dsn)
    try:
        for sql in statements:
            await conn.execute(sql)
    finally:
        await conn.close()


_CREATE_DDL = [
    (
        "DO $$ BEGIN "
        "CREATE TYPE workflow_status AS ENUM "
        "('pending', 'running', 'failed', 'completed', 'terminated', 'cancelled', 'timed_out'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    """
    CREATE TABLE IF NOT EXISTS workflow_execution (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id VARCHAR NOT NULL,
        run_id      VARCHAR NOT NULL,
        workflow_type VARCHAR NOT NULL,
        project_id  UUID,
        project_version INTEGER,
        status      workflow_status NOT NULL,
        start_time  TIMESTAMPTZ,
        end_time    TIMESTAMPTZ,
        failure_message VARCHAR,
        history_s3_key VARCHAR,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_workflow_execution_wf_run UNIQUE (workflow_id, run_id)
    )
    """,
    (
        "CREATE INDEX IF NOT EXISTS ix_workflow_execution_active "
        "ON workflow_execution (status) "
        "WHERE status IN ('pending'::workflow_status, 'running'::workflow_status)"
    ),
    ("CREATE INDEX IF NOT EXISTS ix_workflow_execution_project_type ON workflow_execution (project_id, workflow_type)"),
    ("CREATE INDEX IF NOT EXISTS ix_workflow_execution_end_time ON workflow_execution (end_time)"),
]

_DROP_DDL = [
    "DROP TABLE IF EXISTS workflow_execution",
    "DROP TYPE IF EXISTS workflow_status",
]


@pytest_asyncio.fixture
async def db_session(pg_dsn: str) -> AsyncIterator[AsyncSession]:
    await _run_ddl(pg_dsn, _CREATE_DDL)
    engine = create_async_engine(pg_dsn)
    session = async_sessionmaker(engine, expire_on_commit=False)
    async with session() as session:
        yield session
    await engine.dispose()
    await _run_ddl(pg_dsn, _DROP_DDL)
