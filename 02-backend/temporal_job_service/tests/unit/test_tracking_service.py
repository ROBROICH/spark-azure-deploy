from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.models.db_models import WorkflowExecution, WorkflowStatus
from src.models.schemas.internal_tracking_schemas import StatusRequest
from src.services.tracking_service import TrackingService

pytestmark = pytest.mark.asyncio


async def _all_rows(session) -> list[WorkflowExecution]:
    result = await session.execute(select(WorkflowExecution))
    return list(result.scalars().all())


async def test_pending_status_inserts_new_row(db_session):
    svc = TrackingService(db_session)
    await svc.update_status(
        StatusRequest(
            workflow_id="wf",
            run_id="run",
            workflow_type="T",
            status=WorkflowStatus.PENDING,
            timestamp=datetime.now(UTC),
        )
    )
    rows = await _all_rows(db_session)
    assert len(rows) == 1
    assert rows[0].status == WorkflowStatus.PENDING


async def test_pending_status_is_idempotent(db_session):
    svc = TrackingService(db_session)
    req = StatusRequest(
        workflow_id="wf",
        run_id="run",
        workflow_type="T",
        status=WorkflowStatus.PENDING,
        timestamp=datetime.now(UTC),
    )
    await svc.update_status(req)
    await svc.update_status(req)
    rows = await _all_rows(db_session)
    assert len(rows) == 1


async def test_running_inserts_when_missing(db_session):
    svc = TrackingService(db_session)
    await svc.update_status(
        StatusRequest(
            workflow_id="wf",
            run_id="run",
            workflow_type="T",
            status=WorkflowStatus.RUNNING,
            timestamp=datetime.now(UTC),
        )
    )
    rows = await _all_rows(db_session)
    assert len(rows) == 1
    assert rows[0].status == WorkflowStatus.RUNNING


async def test_running_transitions_from_pending(db_session):
    svc = TrackingService(db_session)
    now = datetime.now(UTC)

    base = {
        "workflow_id": "wf",
        "run_id": "run",
        "workflow_type": "T",
        "timestamp": now,
    }

    await svc.update_status(StatusRequest(**base, status=WorkflowStatus.PENDING))
    await svc.update_status(StatusRequest(**base, status=WorkflowStatus.RUNNING))
    rows = await _all_rows(db_session)
    assert rows[0].status == WorkflowStatus.RUNNING


async def test_terminal_inserts_when_missing(db_session):
    svc = TrackingService(db_session)
    now = datetime.now(UTC)
    await svc.update_status(
        StatusRequest(
            workflow_id="wf",
            run_id="run",
            workflow_type="T",
            status=WorkflowStatus.FAILED,
            timestamp=now,
            failure_message="boom",
            history_s3_key=None,
        )
    )
    rows = await _all_rows(db_session)
    assert len(rows) == 1
    assert rows[0].status == WorkflowStatus.FAILED
    assert rows[0].failure_message == "boom"


async def test_terminal_updates_existing_row(db_session):
    svc = TrackingService(db_session)
    base = {"workflow_id": "wf", "run_id": "run", "workflow_type": "T"}
    await svc.update_status(
        StatusRequest(
            **base,
            status=WorkflowStatus.PENDING,
            timestamp=datetime.now(UTC) - timedelta(minutes=5),
        )
    )
    end = datetime.now(UTC)
    await svc.update_status(
        StatusRequest(
            **base,
            status=WorkflowStatus.COMPLETED,
            timestamp=end,
            history_s3_key="k.json.gz",
        )
    )
    rows = await _all_rows(db_session)
    assert rows[0].status == WorkflowStatus.COMPLETED
    assert rows[0].end_time == end
    assert rows[0].history_s3_key == "k.json.gz"
