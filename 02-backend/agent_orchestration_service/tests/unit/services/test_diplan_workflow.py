from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.models.schemas.temporal.diplan import DiPlanWorkflowArgs
from src.models.schemas.temporal.fvp import FVPExtractionWorkflowResult
from src.models.schemas.topics import TopicResponse
from src.services.activities.fvp import get_topics
from src.services.workflows.diplan import DiPlanWorkflow
from src.services.workflows.workflow_constants import (
    DEFAULT_RETRY_POLICY,
    DEFAULT_START_TO_CLOSE_TIMEOUT,
)


@pytest.mark.asyncio
async def test_diplan_workflow_passes_project_topics_to_fvp(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    file_id = uuid4()
    topic_id = uuid4()
    now = datetime.now(UTC)

    execute_diplan_download = AsyncMock(return_value=[SimpleNamespace(id=file_id)])
    execute_activity = AsyncMock(
        return_value=[
            TopicResponse(
                id=topic_id,
                project_id=uuid4(),
                parent_topic_id=None,
                name="Project topic",
                description="Project topic description",
                is_deleted=False,
                created_at=now,
                updated_at=now,
            )
        ]
    )
    run_fvp_workflow = AsyncMock(return_value=FVPExtractionWorkflowResult(results=[]))

    monkeypatch.setattr(
        "src.services.workflows.diplan.execute_diplan_download",
        execute_diplan_download,
    )
    monkeypatch.setattr(
        "src.services.workflows.diplan.workflow.execute_activity",
        execute_activity,
    )
    monkeypatch.setattr(
        "src.services.workflows.diplan.run_fvp_workflow",
        run_fvp_workflow,
    )

    args = DiPlanWorkflowArgs(
        project_id=project_id,
        folder_information=[],
        files=[],
    )

    await DiPlanWorkflow().run(args)

    assert execute_activity.await_args is not None
    assert execute_activity.await_args.args == (get_topics, project_id)
    assert execute_activity.await_args.kwargs == {
        "start_to_close_timeout": DEFAULT_START_TO_CLOSE_TIMEOUT,
        "retry_policy": DEFAULT_RETRY_POLICY,
    }

    assert run_fvp_workflow.await_args is not None
    fvp_input = run_fvp_workflow.await_args.args[0]
    assert fvp_input.project_id == project_id
    assert fvp_input.file_ids == [str(file_id)]
    assert [topic.id for topic in fvp_input.topics] == [topic_id]
    assert fvp_input.diplan_preprocessing is True
