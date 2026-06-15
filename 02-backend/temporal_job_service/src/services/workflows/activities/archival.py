import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import select, tuple_
from temporal.utils import await_with_heartbeat
from temporalio import activity

from src.models.db_models import WorkflowExecution, WorkflowStatus
from src.services.archiver_service import HistoryArchiver
from src.services.workflows.activities.activity_models import (
    ArchiveOneInput,
    ListUnarchivedBatchInput,
    MarkArchivedInput,
    UnarchivedRow,
)

logger = logging.getLogger("temporal_job_service.archival.activities")

TERMINAL_STATUSES = (
    WorkflowStatus.FAILED,
    WorkflowStatus.COMPLETED,
    WorkflowStatus.TERMINATED,
    WorkflowStatus.CANCELLED,
    WorkflowStatus.TIMED_OUT,
)

# The archival workflow itself runs via the shared tracking interceptor, so
# its own runs land in workflow_execution. Picking those up would create
# an unbounded self-archival loop.
EXCLUDED_WORKFLOW_TYPES = ("WeeklyArchivalWorkflow",)


_temporal_client = None
_archiver: HistoryArchiver | None = None
_session_factory: Callable | None = None


def configure_archival(
    *,
    temporal_client: Any,
    archiver: HistoryArchiver,
    session_factory: Callable | None,
) -> None:
    """Bootstrap hook called from lifespan before starting the archival worker."""
    global _temporal_client, _archiver, _session_factory
    _temporal_client = temporal_client
    _archiver = archiver
    _session_factory = session_factory


async def _list_unarchived(
    session: Any,
    batch_size: int,
    excluded_keys: list[tuple[str, str]] | None = None,
) -> list[UnarchivedRow]:
    stmt = (
        select(WorkflowExecution)
        .where(
            WorkflowExecution.status.in_(TERMINAL_STATUSES),
            WorkflowExecution.history_s3_key.is_(None),
            WorkflowExecution.workflow_type.notin_(EXCLUDED_WORKFLOW_TYPES),
        )
        .order_by(WorkflowExecution.end_time.asc().nulls_last())
        .limit(batch_size)
    )
    if excluded_keys:
        stmt = stmt.where(
            tuple_(WorkflowExecution.workflow_id, WorkflowExecution.run_id).notin_(
                [(wid, rid) for wid, rid in excluded_keys]
            )
        )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        UnarchivedRow(
            workflow_id=row.workflow_id,
            run_id=row.run_id,
            workflow_type=row.workflow_type,
            project_id=str(row.project_id) if row.project_id else None,
            project_version=(str(row.project_version) if row.project_version is not None else None),
            status=row.status.value,
        )
        for row in rows
    ]


async def _mark_archived(session: Any, workflow_id: str, run_id: str, s3_key: str) -> None:
    row = await session.scalar(
        select(WorkflowExecution).where(
            WorkflowExecution.workflow_id == workflow_id,
            WorkflowExecution.run_id == run_id,
        )
    )
    if row is None:
        return
    row.history_s3_key = s3_key
    await session.commit()


@activity.defn(name="archival_list_unarchived_batch")
async def list_unarchived_batch(
    activity_input: ListUnarchivedBatchInput,
) -> list[UnarchivedRow]:
    if _session_factory is None:
        return []
    async with _session_factory() as session:
        return await _list_unarchived(
            session,
            activity_input.batch_size,
            activity_input.excluded_keys,
        )


@activity.defn(name="archival_archive_one")
async def archive_one(activity_input: ArchiveOneInput) -> str:
    if _temporal_client is None or _archiver is None or _session_factory is None:
        raise RuntimeError("archival activities not configured")
    row = activity_input.row
    s3_key = await await_with_heartbeat(
        _archiver.archive(
            _temporal_client,
            workflow_id=row.workflow_id,
            run_id=row.run_id,
            workflow_type=row.workflow_type,
            project_id=row.project_id,
            project_version=row.project_version,
            status=row.status,
        ),
        interval=10,
        detail=f"{row.workflow_id}/{row.run_id}",
    )
    async with _session_factory() as session:
        await _mark_archived(session, row.workflow_id, row.run_id, s3_key)
    return s3_key


@activity.defn(name="archival_mark_archived")
async def mark_archived(activity_input: MarkArchivedInput) -> None:
    if _session_factory is None:
        return
    async with _session_factory() as session:
        await _mark_archived(
            session,
            activity_input.workflow_id,
            activity_input.run_id,
            activity_input.s3_key,
        )
