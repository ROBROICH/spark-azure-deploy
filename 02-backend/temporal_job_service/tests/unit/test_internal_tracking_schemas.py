from datetime import UTC, datetime

import pytest

from src.models.db_models import WorkflowStatus
from src.models.schemas.internal_tracking_schemas import StatusRequest


def test_status_request_minimal():
    req = StatusRequest(
        workflow_id="wf",
        run_id="run",
        workflow_type="T",
        status=WorkflowStatus.PENDING,
        timestamp=datetime(2026, 5, 19, tzinfo=UTC),
    )
    assert req.project_id is None
    assert req.project_version is None
    assert req.history_s3_key is None
    assert req.failure_message is None


def test_status_request_terminal_with_archive_key():
    req = StatusRequest(
        workflow_id="wf",
        run_id="run",
        workflow_type="T",
        status=WorkflowStatus.COMPLETED,
        timestamp=datetime(2026, 5, 19, tzinfo=UTC),
        history_s3_key="bucket/k.json.gz",
    )
    assert req.history_s3_key == "bucket/k.json.gz"


def test_status_request_truncates_failure_message():
    with pytest.raises(ValueError):
        StatusRequest(
            workflow_id="wf",
            run_id="run",
            workflow_type="T",
            status=WorkflowStatus.FAILED,
            timestamp=datetime(2026, 5, 19, tzinfo=UTC),
            failure_message="x" * 501,
        )
