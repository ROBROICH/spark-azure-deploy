from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from src.models.db_models import WorkflowExecution, WorkflowStatus
from src.services.workflows.activities import archival
from src.services.workflows.activities.activity_models import (
    ArchiveOneInput,
    ListUnarchivedBatchInput,
    UnarchivedRow,
)
from src.services.workflows.activities.archival import (
    archive_one,
    list_unarchived_batch,
)

pytestmark = pytest.mark.asyncio


class _SessionFactory:
    def __init__(self, session):
        self._session = session

    def __call__(self):
        return _Ctx(self._session)


class _Ctx:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *_):
        pass


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


async def test_list_unarchived_batch_via_activity(db_session):
    await _insert(
        db_session,
        workflow_id="wf",
        run_id="run",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    archival.configure_archival(
        temporal_client=None,
        archiver=None,
        session_factory=_SessionFactory(db_session),
    )
    try:
        rows = await list_unarchived_batch(ListUnarchivedBatchInput(batch_size=10))
    finally:
        archival.configure_archival(temporal_client=None, archiver=None, session_factory=None)
    assert len(rows) == 1
    assert rows[0].workflow_id == "wf"


async def test_list_unarchived_batch_excludes_keys(db_session):
    await _insert(
        db_session,
        workflow_id="wf-skip",
        run_id="run-skip",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    await _insert(
        db_session,
        workflow_id="wf-keep",
        run_id="run-keep",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )
    archival.configure_archival(
        temporal_client=None,
        archiver=None,
        session_factory=_SessionFactory(db_session),
    )
    try:
        rows = await list_unarchived_batch(
            ListUnarchivedBatchInput(
                batch_size=10,
                excluded_keys=[("wf-skip", "run-skip")],
            )
        )
    finally:
        archival.configure_archival(temporal_client=None, archiver=None, session_factory=None)
    assert [r.workflow_id for r in rows] == ["wf-keep"]


async def test_archive_one_marks_archived(db_session):
    await _insert(
        db_session,
        workflow_id="wf",
        run_id="run",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )

    archiver = MagicMock()
    archiver.archive = AsyncMock(return_value="bucket/path/wf/run.json.gz")
    temporal_client = MagicMock()

    archival.configure_archival(
        temporal_client=temporal_client,
        archiver=archiver,
        session_factory=_SessionFactory(db_session),
    )
    try:
        key = await archive_one(
            ArchiveOneInput(
                row=UnarchivedRow(
                    workflow_id="wf",
                    run_id="run",
                    workflow_type="T",
                    project_id=None,
                    project_version=None,
                    status="completed",
                )
            )
        )
    finally:
        archival.configure_archival(temporal_client=None, archiver=None, session_factory=None)

    assert key == "bucket/path/wf/run.json.gz"
    row = (await db_session.execute(select(WorkflowExecution))).scalar_one()
    assert row.history_s3_key == "bucket/path/wf/run.json.gz"
    archiver.archive.assert_awaited_once()


async def test_archive_one_propagates_archiver_failure(db_session):
    await _insert(
        db_session,
        workflow_id="wf",
        run_id="run",
        status=WorkflowStatus.COMPLETED,
        end_time=datetime.now(UTC),
    )

    archiver = MagicMock()
    archiver.archive = AsyncMock(side_effect=RuntimeError("s3 down"))

    archival.configure_archival(
        temporal_client=MagicMock(),
        archiver=archiver,
        session_factory=_SessionFactory(db_session),
    )
    try:
        with pytest.raises(RuntimeError, match="s3 down"):
            await archive_one(
                ArchiveOneInput(
                    row=UnarchivedRow(
                        workflow_id="wf",
                        run_id="run",
                        workflow_type="T",
                        project_id=None,
                        project_version=None,
                        status="completed",
                    )
                )
            )
    finally:
        archival.configure_archival(temporal_client=None, archiver=None, session_factory=None)

    row = (await db_session.execute(select(WorkflowExecution))).scalar_one()
    assert row.history_s3_key is None
