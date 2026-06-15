from collections.abc import Callable
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from temporal.workflows.risikohinweis.types import PFBChapter, RiskFinderOutput, RiskFinding
from temporalio.exceptions import ApplicationError

from src.api.routes.workflows_api import start_risikohinweise_workflow
from src.models.schemas.workflows import RisikohinweiseRequest
from src.services.api_clients import AdministrativeFileDraftRisk, NodeRef
from src.services.project_version_errors import PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES, VERSION_NOT_LATEST_ERROR_TYPE
from src.workflows.risikohinweise.activity import (
    ReplaceProjectRisksOutput,
    _fetch_risikohinweis_chapter,
    _replace_vae_node_risks,
    api_retry_policy,
)
from src.workflows.risikohinweise.types import (
    RISIKOHINWEISE_WORKFLOW_ID,
    FetchRisikohinweisChapterInput,
    ReplaceVaeNodeRisksInput,
    RisikohinweiseWorkflowInput,
)
from src.workflows.risikohinweise.workflow import RisikohinweiseWorkflow


def test_risikohinweise_api_retry_policy_does_not_retry_project_version_conflicts() -> None:
    assert set(PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES).issubset(
        set(api_retry_policy.non_retryable_error_types or ())
    )


@pytest.mark.asyncio
async def test_fetch_risikohinweis_chapter_returns_target_vae_node(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    vae_node_id = uuid4()

    batch_get_nodes = AsyncMock(
        return_value={
            "results": [
                {
                    "node_type": "vae_node",
                    "id": str(vae_node_id),
                    "title": "Target",
                    "text": "Substanz",
                    "order": 1,
                    "is_hidden": False,
                    "frontend_parent_ids": [],
                },
            ]
        }
    )
    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.batch_get_nodes",
        batch_get_nodes,
    )

    result = await _fetch_risikohinweis_chapter(
        FetchRisikohinweisChapterInput(project_id=project_id, vae_node_id=vae_node_id)
    )

    assert result == PFBChapter(id=vae_node_id, title="Target", text="Substanz")
    batch_get_nodes.assert_awaited_once_with(
        project_id,
        NodeRef(node_type="vae_node", id=vae_node_id),
    )


@pytest.mark.asyncio
async def test_replace_vae_node_risks_replaces_only_target_node_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    vae_node_id = uuid4()
    other_vae_node_id = uuid4()
    old_risk_id = uuid4()
    same_risk_id = uuid4()
    untouched_risk_id = uuid4()

    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.get_risks",
        AsyncMock(
            return_value=[
                AdministrativeFileDraftRisk(id=old_risk_id, vae_node_id=vae_node_id),
                AdministrativeFileDraftRisk(id=same_risk_id, vae_node_id=vae_node_id, status="corrected"),
                AdministrativeFileDraftRisk(id=untouched_risk_id, vae_node_id=other_vae_node_id),
            ]
        ),
    )
    update_nodes = AsyncMock(
        return_value={
            "deleted": [{"id": str(old_risk_id)}, {"id": str(same_risk_id)}],
            "inserted": [{"id": str(same_risk_id)}],
        }
    )
    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.update_nodes",
        update_nodes,
    )

    result = await _replace_vae_node_risks(
        ReplaceVaeNodeRisksInput(
            project_id=project_id,
            vae_node_id=vae_node_id,
            risks=[
                {
                    "id": same_risk_id,
                    "vae_node_id": vae_node_id,
                    "problem": "Problem",
                    "severity": 7,
                    "implication": "Implikation",
                }
            ],
        )
    )

    assert result == ReplaceProjectRisksOutput(deleted_count=2, inserted_count=1)
    update_call = update_nodes.call_args.kwargs
    assert update_call["deletes"] == [
        {"node_type": "risks", "id": str(old_risk_id)},
        {"node_type": "risks", "id": str(same_risk_id)},
    ]
    assert update_call["inserts"][0]["payload"]["status"] == "corrected"
    assert update_call["inserts"][0]["payload"]["vae_node_id"] == str(vae_node_id)


@pytest.mark.asyncio
async def test_replace_vae_node_risks_skips_write_when_expected_risks_already_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    vae_node_id = uuid4()
    risk_id = uuid4()

    get_risks = AsyncMock(return_value=[AdministrativeFileDraftRisk(id=risk_id, vae_node_id=vae_node_id)])
    update_nodes = AsyncMock()
    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.get_risks",
        get_risks,
    )
    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.update_nodes",
        update_nodes,
    )

    result = await _replace_vae_node_risks(
        ReplaceVaeNodeRisksInput(
            project_id=project_id,
            vae_node_id=vae_node_id,
            risks=[
                {
                    "id": risk_id,
                    "vae_node_id": vae_node_id,
                    "problem": "Problem",
                    "severity": 3,
                    "implication": "Implikation",
                }
            ],
        )
    )

    assert result == ReplaceProjectRisksOutput(deleted_count=0, inserted_count=1)
    get_risks.assert_awaited_once_with(project_id)
    update_nodes.assert_not_awaited()


@pytest.mark.asyncio
async def test_replace_vae_node_risks_propagates_non_retryable_project_version_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    vae_node_id = uuid4()
    risk_id = uuid4()
    error = ApplicationError(
        "Provided project version 1 is not the latest version 2",
        type=VERSION_NOT_LATEST_ERROR_TYPE,
        non_retryable=True,
    )

    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.get_risks",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        "src.workflows.risikohinweise.activity.AdministrativeFileDraftApiClient.update_nodes",
        AsyncMock(side_effect=error),
    )

    with pytest.raises(ApplicationError) as exc_info:
        await _replace_vae_node_risks(
            ReplaceVaeNodeRisksInput(
                project_id=project_id,
                vae_node_id=vae_node_id,
                risks=[
                    {
                        "id": risk_id,
                        "vae_node_id": vae_node_id,
                        "problem": "Problem",
                        "severity": 3,
                        "implication": "Implikation",
                    }
                ],
            )
        )
    assert exc_info.value.type == VERSION_NOT_LATEST_ERROR_TYPE
    assert exc_info.value.non_retryable is True


@pytest.mark.asyncio
async def test_risikohinweise_workflow_persists_single_child_result(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    vae_node_id = uuid4()
    chapter = PFBChapter(id=vae_node_id, title="Kapitel 1", text="Text 1")
    captured_replace_input: ReplaceVaeNodeRisksInput | None = None

    async def mock_api_call(activity_fn: Callable[..., Any], arg: Any) -> Any:
        nonlocal captured_replace_input
        if activity_fn.__name__ == "_fetch_risikohinweis_chapter":
            assert arg == FetchRisikohinweisChapterInput(project_id=project_id, vae_node_id=vae_node_id)
            return chapter
        if activity_fn.__name__ == "_replace_vae_node_risks":
            captured_replace_input = arg
            return ReplaceProjectRisksOutput(deleted_count=0, inserted_count=len(arg.risks))
        raise AssertionError(f"Unexpected activity {activity_fn}")

    execute_child_workflow = AsyncMock(
        return_value=RiskFinderOutput(
            risks=[
                RiskFinding(
                    risk_id=uuid4(),
                    chapter_id=vae_node_id,
                    quote="Zitat 1",
                    description="Problem 1",
                    implications="Implikation 1",
                    recommendation="Empfehlung 1",
                    severity=4,
                )
            ]
        )
    )

    monkeypatch.setattr("src.workflows.risikohinweise.workflow.api_call", mock_api_call)
    monkeypatch.setattr(
        "src.workflows.risikohinweise.workflow.execute_risikohinweis_child_workflow",
        execute_child_workflow,
    )

    result = await RisikohinweiseWorkflow().run(
        RisikohinweiseWorkflowInput(project_id=project_id, vae_node_id=vae_node_id)
    )

    assert result.project_id == project_id
    assert result.chapters_processed == 1
    assert result.risks_persisted == 1
    assert captured_replace_input is not None
    assert captured_replace_input.vae_node_id == vae_node_id
    assert len(captured_replace_input.risks) == 1
    assert captured_replace_input.risks[0].problem == "Problem 1"
    assert execute_child_workflow.await_count == 1
    assert execute_child_workflow.await_args_list[0].args[0] == chapter
    assert execute_child_workflow.await_args_list[0].kwargs["project_id"] == str(project_id)


@pytest.mark.asyncio
async def test_risikohinweise_workflow_clears_node_risks_when_no_chapter(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    vae_node_id = uuid4()
    captured_replace_input: ReplaceVaeNodeRisksInput | None = None
    execute_workflow = AsyncMock()

    async def mock_api_call(activity_fn: Callable[..., Any], arg: Any) -> Any:
        nonlocal captured_replace_input
        if activity_fn.__name__ == "_fetch_risikohinweis_chapter":
            return None
        if activity_fn.__name__ == "_replace_vae_node_risks":
            captured_replace_input = arg
            return ReplaceProjectRisksOutput(deleted_count=0, inserted_count=0)
        raise AssertionError(f"Unexpected activity {activity_fn}")

    monkeypatch.setattr("src.workflows.risikohinweise.workflow.api_call", mock_api_call)
    monkeypatch.setattr(
        "src.workflows.risikohinweise.workflow.execute_risikohinweis_child_workflow",
        execute_workflow,
    )

    result = await RisikohinweiseWorkflow().run(
        RisikohinweiseWorkflowInput(project_id=project_id, vae_node_id=vae_node_id)
    )

    assert result.chapters_processed == 0
    assert result.risks_persisted == 0
    assert captured_replace_input is not None
    assert captured_replace_input.vae_node_id == vae_node_id
    assert captured_replace_input.risks == []
    execute_workflow.assert_not_awaited()


@pytest.mark.asyncio
async def test_risikohinweise_workflow_does_not_replace_when_child_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    chapter = PFBChapter(id=uuid4(), title="Kapitel", text="Text")
    replace_calls = 0

    async def mock_api_call(activity_fn: Callable[..., Any], arg: Any) -> Any:
        nonlocal replace_calls
        if activity_fn.__name__ == "_fetch_risikohinweis_chapter":
            return chapter
        if activity_fn.__name__ == "_replace_vae_node_risks":
            replace_calls += 1
            return ReplaceProjectRisksOutput(deleted_count=0, inserted_count=0)
        raise AssertionError(f"Unexpected activity {activity_fn}")

    execute_workflow = AsyncMock(side_effect=RuntimeError("child failed"))

    monkeypatch.setattr("src.workflows.risikohinweise.workflow.api_call", mock_api_call)
    monkeypatch.setattr(
        "src.workflows.risikohinweise.workflow.execute_risikohinweis_child_workflow",
        execute_workflow,
    )

    with pytest.raises(RuntimeError, match="child failed"):
        await RisikohinweiseWorkflow().run(RisikohinweiseWorkflowInput(project_id=project_id, vae_node_id=chapter.id))

    assert replace_calls == 0


@pytest.mark.asyncio
async def test_start_risikohinweise_route_uses_default_workflow_id(monkeypatch: pytest.MonkeyPatch) -> None:
    expected_project_version = 7
    project_id = uuid4()
    vae_node_id = uuid4()
    start_workflow = AsyncMock(return_value=SimpleNamespace(id="risk-workflow-id"))
    latest_project_version = AsyncMock(return_value=expected_project_version)
    monkeypatch.setattr("src.api.routes.workflows_api.start_workflow", start_workflow)
    monkeypatch.setattr("src.api.routes.workflows_api._latest_project_version", latest_project_version)

    response = await start_risikohinweise_workflow(
        RisikohinweiseRequest(project_id=project_id, vae_node_id=vae_node_id)
    )

    assert response.parent_job_id == "risk-workflow-id"
    assert start_workflow.await_args is not None
    assert start_workflow.await_args.kwargs["workflow_id"] == RISIKOHINWEISE_WORKFLOW_ID
    assert start_workflow.await_args.kwargs["input"].vae_node_id == vae_node_id
    assert start_workflow.await_args.kwargs["project_id"] == project_id
    assert start_workflow.await_args.kwargs["project_version"] == expected_project_version
    latest_project_version.assert_awaited_once_with(project_id)
    assert (
        start_workflow.await_args.kwargs["_ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID"]
        == f"{RISIKOHINWEISE_WORKFLOW_ID}-{project_id}-v7-{vae_node_id}"
    )
