from types import SimpleNamespace
from uuid import UUID

import pytest
from temporal.project_context import use_project_context

from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.project_schemas import ProjectInternalStatusEnum
from src.services.workflows import initialize_project as workflow_module
from src.services.workflows.workflow_models import ProjectInitializationInput

PROJECT_ID = UUID("00000000-0000-0000-0000-00000000f101")
PROJECT_TYPE_ID = UUID("00000000-0000-0000-0000-00000000f102")


def _activity_name(activity) -> str:
    return activity if isinstance(activity, str) else activity.__name__


def _stub_workflow_logger(monkeypatch) -> None:
    monkeypatch.setattr(
        workflow_module.workflow,
        "logger",
        SimpleNamespace(info=lambda *_args, **_kwargs: None, exception=lambda *_args, **_kwargs: None),
    )


@pytest.mark.asyncio
async def test_project_initialization_sets_upload_documents_for_initial_project_version(monkeypatch):
    calls: list[tuple[str, tuple]] = []

    async def fake_execute_activity(activity, *_, args=(), **__):
        calls.append((_activity_name(activity), tuple(args)))

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    _stub_workflow_logger(monkeypatch)

    with use_project_context(PROJECT_ID, 1):
        result = await workflow_module.ProjectInitializationWorkflow().run(
            ProjectInitializationInput(project_id=PROJECT_ID, project_type_id=PROJECT_TYPE_ID)
        )

    assert result.status == WorkflowStatusEnum.COMPLETED
    assert calls == [
        ("assign_vae_template", (PROJECT_ID, PROJECT_TYPE_ID)),
        ("update_project_status", (PROJECT_ID, ProjectInternalStatusEnum.UPLOAD_DOCUMENTS)),
    ]


@pytest.mark.asyncio
async def test_project_initialization_keeps_status_for_later_project_versions(monkeypatch):
    calls: list[tuple[str, tuple]] = []

    async def fake_execute_activity(activity, *_, args=(), **__):
        calls.append((_activity_name(activity), tuple(args)))

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    _stub_workflow_logger(monkeypatch)

    with use_project_context(PROJECT_ID, 2):
        result = await workflow_module.ProjectInitializationWorkflow().run(
            ProjectInitializationInput(project_id=PROJECT_ID, project_type_id=PROJECT_TYPE_ID)
        )

    assert result.status == WorkflowStatusEnum.COMPLETED
    assert calls == [
        ("assign_vae_template", (PROJECT_ID, PROJECT_TYPE_ID)),
    ]
