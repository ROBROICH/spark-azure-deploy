from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest

from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.project_schemas import ProjectInternalStatusEnum
from src.services.workflows import initialize_project as workflow_module
from src.services.workflows.workflow_models import ProjectInitializationInput

PROJECT_ID = UUID("00000000-0000-0000-0000-00000000f101")
PROJECT_TYPE_ID = UUID("00000000-0000-0000-0000-00000000f102")


def _activity_name(activity: Any) -> str:
    return activity if isinstance(activity, str) else activity.__name__


@pytest.mark.asyncio
async def test_project_initialization_seeds_fcs_before_template_and_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fake_execute_activity(
        activity: Any,
        *_: Any,
        args: tuple[Any, ...] = (),
        **__: Any,
    ) -> None:
        calls.append((_activity_name(activity), tuple(args)))

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(
        workflow_module.workflow,
        "logger",
        SimpleNamespace(info=lambda *_, **__: None, exception=lambda *_, **__: None),
    )

    result = await workflow_module.ProjectInitializationWorkflow().run(
        ProjectInitializationInput(
            project_id=PROJECT_ID,
            project_type_id=PROJECT_TYPE_ID,
            project_version=2,
        )
    )

    assert result.status == WorkflowStatusEnum.COMPLETED
    assert calls == [
        ("initialize_fcs_required_document_types", (PROJECT_ID, PROJECT_TYPE_ID, 2)),
        ("assign_vae_template", (PROJECT_ID, PROJECT_TYPE_ID)),
        ("update_project_status", (PROJECT_ID, ProjectInternalStatusEnum.UPLOAD_DOCUMENTS)),
    ]
