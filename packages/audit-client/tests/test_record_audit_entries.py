"""Tests for the caller-owned audit transaction API."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from audit_client.client import AuditEntry, record_audit_entries, record_audit_entry
from audit_client.enums import ChangeType
from audit_client.forwarding import actor_user_id_ctx
from sqlalchemy.ext.asyncio import AsyncSession


def _active_session() -> MagicMock:
    session = MagicMock(spec=AsyncSession)
    session.in_transaction.return_value = True
    session.execute = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_empty_entries_does_not_call_execute():
    session = _active_session()

    await record_audit_entries(
        session,
        project_id=uuid4(),
        entries=[],
    )

    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_multiple_entries_inserted_in_one_call():
    session = _active_session()
    project_id = uuid4()
    ids = [uuid4(), uuid4(), uuid4()]

    entries = [
        AuditEntry(
            entity_type="argument", change_type=ChangeType.CREATE, entity_id=ids[0], action_type="EWMS_EXTRACTION"
        ),
        AuditEntry(
            entity_type="argument", change_type=ChangeType.CREATE, entity_id=ids[1], action_type="EWMS_EXTRACTION"
        ),
        AuditEntry(entity_type="beteiligungs_eingang", change_type=ChangeType.UPDATE, entity_id=ids[2]),
    ]

    await record_audit_entries(session, project_id=project_id, entries=entries)

    assert session.execute.call_count == 1
    _, rows = session.execute.call_args[0]
    assert len(rows) == len(entries)
    assert rows[0]["entity_type"] == "argument"
    assert rows[0]["change_type"] == ChangeType.CREATE.value
    assert rows[0]["entity_id"] == ids[0]
    assert rows[0]["action_type"] == "EWMS_EXTRACTION"
    assert rows[1]["entity_id"] == ids[1]
    assert rows[2]["entity_type"] == "beteiligungs_eingang"
    assert rows[2]["change_type"] == ChangeType.UPDATE.value
    assert rows[2]["action_type"] is None


@pytest.mark.asyncio
async def test_all_rows_get_same_project_id():
    session = _active_session()
    project_id = uuid4()

    entries = [
        AuditEntry(entity_type="argument", change_type=ChangeType.UPDATE, entity_id=uuid4()),
        AuditEntry(entity_type="argument", change_type=ChangeType.UPDATE, entity_id=uuid4()),
    ]

    await record_audit_entries(session, project_id=project_id, entries=entries)

    _, rows = session.execute.call_args[0]
    assert all(row["project_id"] == project_id for row in rows)


@pytest.mark.asyncio
async def test_actor_resolved_from_context_var():
    session = _active_session()
    actor_id = uuid4()

    token = actor_user_id_ctx.set(actor_id)
    try:
        await record_audit_entries(
            session,
            project_id=uuid4(),
            entries=[AuditEntry(entity_type="argument", change_type=ChangeType.CREATE, entity_id=uuid4())],
        )
    finally:
        actor_user_id_ctx.reset(token)

    _, rows = session.execute.call_args[0]
    assert rows[0]["actor_user_id"] == actor_id


@pytest.mark.asyncio
async def test_explicit_actor_overrides_context_var():
    session = _active_session()
    ctx_actor = uuid4()
    explicit_actor = uuid4()

    token = actor_user_id_ctx.set(ctx_actor)
    try:
        await record_audit_entries(
            session,
            project_id=uuid4(),
            entries=[AuditEntry(entity_type="argument", change_type=ChangeType.UPDATE, entity_id=uuid4())],
            actor_user_id=explicit_actor,
        )
    finally:
        actor_user_id_ctx.reset(token)

    _, rows = session.execute.call_args[0]
    assert rows[0]["actor_user_id"] == explicit_actor


@pytest.mark.asyncio
async def test_each_row_gets_unique_id():
    session = _active_session()

    entries = [
        AuditEntry(entity_type="argument", change_type=ChangeType.CREATE, entity_id=uuid4()),
        AuditEntry(entity_type="argument", change_type=ChangeType.CREATE, entity_id=uuid4()),
    ]

    await record_audit_entries(session, project_id=uuid4(), entries=entries)

    _, rows = session.execute.call_args[0]
    row_ids = [row["id"] for row in rows]
    assert len(set(row_ids)) == len(row_ids)


@pytest.mark.asyncio
async def test_workflow_context_propagated_to_all_rows():
    session = _active_session()
    workflow_run_id = "test-run-123"
    workflow_type = "EWMSOrchestratorWorkflow"

    entries = [
        AuditEntry(entity_type="argument", change_type=ChangeType.CREATE, entity_id=uuid4()),
        AuditEntry(entity_type="beteiligungs_eingang", change_type=ChangeType.CREATE, entity_id=uuid4()),
    ]

    await record_audit_entries(
        session,
        project_id=uuid4(),
        entries=entries,
        workflow_run_id=workflow_run_id,
        workflow_type=workflow_type,
    )

    _, rows = session.execute.call_args[0]
    assert all(row["workflow_run_id"] == workflow_run_id for row in rows)
    assert all(row["workflow_type"] == workflow_type for row in rows)


@pytest.mark.asyncio
async def test_non_empty_batch_requires_the_callers_active_transaction():
    session = _active_session()
    session.in_transaction.return_value = False

    with pytest.raises(RuntimeError, match="active transaction"):
        await record_audit_entries(
            session,
            project_id=uuid4(),
            entries=[AuditEntry(entity_type="project", change_type=ChangeType.CREATE, entity_id=uuid4())],
        )

    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_single_write_requires_the_callers_active_transaction():
    session = _active_session()
    session.in_transaction.return_value = False

    with pytest.raises(RuntimeError, match="active transaction"):
        await record_audit_entry(
            session,
            project_id=uuid4(),
            entity_type="project",
            change_type=ChangeType.CREATE,
        )

    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_batch_validates_every_action_before_the_single_insert():
    session = _active_session()

    with pytest.raises(ValueError, match="action_type"):
        await record_audit_entries(
            session,
            project_id=uuid4(),
            entries=[
                AuditEntry(entity_type="project", change_type=ChangeType.CREATE, entity_id=uuid4()),
                AuditEntry(entity_type="project", change_type=ChangeType.ACTION, entity_id=uuid4()),
            ],
        )

    session.execute.assert_not_called()
