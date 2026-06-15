from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.models.db_models import WorkflowExecution, WorkflowStatus
from src.services.workflows.activities.archival import _list_unarchived, _mark_archived

pytestmark = pytest.mark.asyncio


async def _insert(session, **kwargs):
    row = WorkflowExecution(
        workflow_id=kwargs["workflow_id"],
        run_id=kwargs["run_id"],
        workflow_type=kwargs.get("workflow_type", "T"),
        status=kwargs["status"],
        start_time=datetime.now(UTC),
        end_time=kwargs.get("end_time"),
        history_s3_key=kwargs.get("history_s3_key"),
    )
    session.add(row)
    await session.commit()


async def test_list_unarchived_excludes_running(db_session):
    await _insert(
        db_session,
        workflow_id="wf-r",
        run_id="run-r",
        status=WorkflowStatus.RUNNING,
    )
    await _insert(
        db_session,
        workflow_id="wf-c",
        run_id="run-c",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    rows = await _list_unarchived(db_session, batch_size=10)
    assert {r.workflow_id for r in rows} == {"wf-c"}


async def test_list_unarchived_excludes_already_archived(db_session):
    await _insert(
        db_session,
        workflow_id="wf-1",
        run_id="run-1",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
        history_s3_key="already/here.json.gz",
    )
    await _insert(
        db_session,
        workflow_id="wf-2",
        run_id="run-2",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    rows = await _list_unarchived(db_session, batch_size=10)
    assert {r.workflow_id for r in rows} == {"wf-2"}


async def test_list_unarchived_orders_by_end_time(db_session):
    now = datetime.now(UTC)
    await _insert(
        db_session,
        workflow_id="wf-new",
        run_id="run-new",
        status=WorkflowStatus.COMPLETED,
        end_time=now,
    )
    await _insert(
        db_session,
        workflow_id="wf-old",
        run_id="run-old",
        status=WorkflowStatus.FAILED,
        end_time=now - timedelta(days=7),
    )
    rows = await _list_unarchived(db_session, batch_size=10)
    assert [r.workflow_id for r in rows] == ["wf-old", "wf-new"]


async def test_list_unarchived_respects_batch_size(db_session):
    for i in range(5):
        await _insert(
            db_session,
            workflow_id=f"wf-{i}",
            run_id=f"run-{i}",
            status=WorkflowStatus.COMPLETED,
            end_time=datetime.now(UTC),
        )
    rows = await _list_unarchived(db_session, batch_size=2)
    assert len(rows) == 2


async def test_mark_archived_sets_s3_key(db_session):
    await _insert(
        db_session,
        workflow_id="wf",
        run_id="run",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    await _mark_archived(db_session, "wf", "run", "bucket/path/wf/run.json.gz")
    row = (await db_session.execute(select(WorkflowExecution))).scalar_one()
    assert row.history_s3_key == "bucket/path/wf/run.json.gz"


async def test_list_unarchived_excludes_self_archival_workflow(db_session):
    await _insert(
        db_session,
        workflow_id="wf-self",
        run_id="run-self",
        workflow_type="WeeklyArchivalWorkflow",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    await _insert(
        db_session,
        workflow_id="wf-other",
        run_id="run-other",
        workflow_type="OtherWorkflow",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    rows = await _list_unarchived(db_session, batch_size=10)
    assert {r.workflow_id for r in rows} == {"wf-other"}


async def test_mark_archived_missing_row_noops(db_session):
    await _mark_archived(db_session, "nope", "nope", "k")  # must not raise
    rows = (await db_session.execute(select(WorkflowExecution))).scalars().all()
    assert rows == []
