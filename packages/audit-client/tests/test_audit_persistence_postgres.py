"""Real PostgreSQL proof for caller-owned audit transactions.

The test database must already be at the Project Logic Alembic head. This
module never creates or migrates schema and skips unless the qualification URL
is supplied explicitly.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from audit_client.client import AuditEntry, record_audit_entries, record_audit_entry
from audit_client.context import AuditContext, audit_context_scope
from audit_client.enums import ChangeType
from audit_client.models import audit_log_table
from sqlalchemy import Column, DateTime, MetaData, String, Table, insert, select
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = os.getenv("AUDIT_PERSISTENCE_TEST_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="AUDIT_PERSISTENCE_TEST_URL is unset")

domain_metadata = MetaData()
project_type_table = Table(
    "project_type",
    domain_metadata,
    Column("id", PG_UUID(as_uuid=True), nullable=False),
    Column("name", String, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)


def _async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)


@pytest.fixture
async def engine() -> AsyncEngine:
    assert DATABASE_URL is not None
    value = create_async_engine(_async_url(DATABASE_URL), pool_size=2, max_overflow=0)
    try:
        yield value
    finally:
        await value.dispose()


async def _domain_and_audit_rows(engine: AsyncEngine, entity_id: UUID) -> tuple[list[UUID], list[dict[str, object]]]:
    async with engine.connect() as connection:
        domains = list(
            (
                await connection.execute(select(project_type_table.c.id).where(project_type_table.c.id == entity_id))
            ).scalars()
        )
        audits = list(
            (
                await connection.execute(select(audit_log_table).where(audit_log_table.c.entity_id == entity_id))
            ).mappings()
        )
    return domains, [dict(row) for row in audits]


@pytest.mark.asyncio
async def test_domain_and_meaningful_audit_row_commit_together(engine: AsyncEngine) -> None:
    entity_id = uuid4()
    actor_id = uuid4()
    triggered_by_id = uuid4()
    request_id = str(uuid4())
    request_start = datetime(2026, 7, 16, 8, 9, 10, 123000, tzinfo=UTC)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async with sessions() as session, session.begin():
        await session.execute(
            insert(project_type_table).values(
                id=entity_id,
                name=f"audit-commit-{entity_id}",
                created_at=request_start,
                updated_at=request_start,
            )
        )
        with audit_context_scope(
            active=AuditContext(
                actor_user_id=actor_id,
                triggered_by_user_id=triggered_by_id,
                workflow_run_id="workflow-run-4314",
                workflow_type="AuditPersistenceWorkflow",
                request_start_time=request_start,
                request_id=request_id,
            )
        ):
            await record_audit_entry(
                session,
                project_id=entity_id,
                entity_id=entity_id,
                entity_type="project_type",
                change_type=ChangeType.ACTION,
                action_type="publish",
            )

    domains, audits = await _domain_and_audit_rows(engine, entity_id)
    assert domains == [entity_id]
    assert len(audits) == 1
    row = audits[0]
    assert isinstance(row["id"], UUID)
    assert isinstance(row["timestamp"], datetime)
    assert row["project_id"] == entity_id
    assert row["entity_id"] == entity_id
    assert row["entity_type"] == "project_type"
    assert row["change_type"] == "action"
    assert row["action_type"] == "publish"
    assert row["actor_user_id"] == actor_id
    assert row["triggered_by_user_id"] == triggered_by_id
    assert row["workflow_run_id"] == "workflow-run-4314"
    assert row["workflow_type"] == "AuditPersistenceWorkflow"
    assert row["request_start_time"] == request_start
    assert row["request_id"] == request_id


@pytest.mark.asyncio
async def test_domain_and_audit_row_roll_back_together(engine: AsyncEngine) -> None:
    entity_id = uuid4()
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    with pytest.raises(RuntimeError, match="intentional rollback"):
        async with sessions() as session, session.begin():
            now = datetime.now(UTC)
            await session.execute(
                insert(project_type_table).values(
                    id=entity_id,
                    name=f"audit-rollback-{entity_id}",
                    created_at=now,
                    updated_at=now,
                )
            )
            await record_audit_entry(
                session,
                project_id=entity_id,
                entity_id=entity_id,
                entity_type="project_type",
                change_type=ChangeType.CREATE,
            )
            raise RuntimeError("intentional rollback")

    assert await _domain_and_audit_rows(engine, entity_id) == ([], [])


@pytest.mark.asyncio
async def test_failing_bulk_leaves_no_domain_or_partial_audit_state(engine: AsyncEngine) -> None:
    entity_id = uuid4()
    second_id = uuid4()
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    with pytest.raises(IntegrityError):
        async with sessions() as session, session.begin():
            now = datetime.now(UTC)
            await session.execute(
                insert(project_type_table).values(
                    id=entity_id,
                    name=f"audit-invalid-bulk-{entity_id}",
                    created_at=now,
                    updated_at=now,
                )
            )
            await record_audit_entries(
                session,
                project_id=entity_id,
                entries=[
                    AuditEntry(entity_type="project_type", change_type=ChangeType.CREATE, entity_id=entity_id),
                    AuditEntry(
                        entity_type=None,  # type: ignore[arg-type] -- database NOT NULL acceptance probe
                        change_type=ChangeType.UPDATE,
                        entity_id=second_id,
                    ),
                ],
            )

    domains, audits = await _domain_and_audit_rows(engine, entity_id)
    assert domains == []
    assert audits == []
    assert (await _domain_and_audit_rows(engine, second_id))[1] == []


@pytest.mark.asyncio
async def test_empty_bulk_is_a_database_no_op_inside_active_transaction(engine: AsyncEngine) -> None:
    project_id = uuid4()
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async with sessions() as session, session.begin():
        await record_audit_entries(session, project_id=project_id, entries=[])

    assert (await _domain_and_audit_rows(engine, project_id))[1] == []


@pytest.mark.asyncio
async def test_adapter_rejects_an_inactive_real_session(engine: AsyncEngine) -> None:
    session = AsyncSession(engine)
    try:
        with pytest.raises(RuntimeError, match="active transaction"):
            await record_audit_entry(
                session,
                project_id=uuid4(),
                entity_type="project_type",
                change_type=ChangeType.CREATE,
            )
    finally:
        await session.close()
