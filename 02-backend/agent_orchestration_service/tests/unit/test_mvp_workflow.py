from typing import Any
from uuid import uuid4

import pytest
from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowOutput

from src.workflows.insert_rechtsmethodik_results.types import InsertRechtsmethodikResultOutput
from src.workflows.mvp import workflow as workflow_module
from src.workflows.mvp.types import MVPWorkflowInput
from src.workflows.mvp.workflow import MVPWorkflow, _run_rechtsmethodik_and_insert


@pytest.mark.asyncio
async def test_mvp_workflow_propagates_skipped_from_reused_rechtsmethodik_insert(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    gesetz_id = uuid4()
    norm_id = uuid4()

    async def mock_run_rechtsmethodik_and_insert(
        *args: Any, **kwargs: Any
    ) -> tuple[RechtsmethodikWorkflowOutput, list[InsertRechtsmethodikResultOutput]]:
        return (
            RechtsmethodikWorkflowOutput(
                gesetz="Bundesnaturschutzgesetz",
                jurabk="BNatSchG",
                standangaben=[],
                paragraph_nr="§ 44",
                paragraph_titel="Titel",
                paragraph_text="Normtext",
                absaetze=[],
                regelungsgegenstand=None,
            ),
            [
                InsertRechtsmethodikResultOutput(
                    gesetz_id=gesetz_id,
                    norm_id=norm_id,
                    skipped=True,
                    nodes_inserted=0,
                )
            ],
        )

    monkeypatch.setattr(
        "src.workflows.mvp.workflow._run_rechtsmethodik_and_insert",
        mock_run_rechtsmethodik_and_insert,
    )

    result = await MVPWorkflow().run(
        MVPWorkflowInput(
            project_id=project_id,
            jurabk="BNatSchG",
            paragraph_nr="§ 44",
        )
    )

    assert result.project_id == project_id
    assert result.gesetz_id == gesetz_id
    assert result.norm_id == norm_id
    assert result.skipped is True


@pytest.mark.asyncio
async def test_mvp_cache_lookup_retries_indefinitely_before_expensive_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    gesetz_id = uuid4()
    norm_id = uuid4()
    activity_options: dict[str, Any] = {}
    child_workflows: list[Any] = []
    cached = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[],
        regelungsgegenstand=None,
    )

    async def fake_execute_activity(activity: Any, _args: Any, **kwargs: Any) -> dict[str, Any]:
        activity_options[getattr(activity, "__temporal_activity_definition").name] = kwargs
        return cached.model_dump()

    async def fake_execute_child_workflow(
        workflow: Any, *_args: Any, **_kwargs: Any
    ) -> list[InsertRechtsmethodikResultOutput]:
        child_workflows.append(workflow)
        return [
            InsertRechtsmethodikResultOutput(
                gesetz_id=gesetz_id,
                norm_id=norm_id,
                skipped=False,
                nodes_inserted=0,
            )
        ]

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(workflow_module.workflow, "execute_child_workflow", fake_execute_child_workflow)
    monkeypatch.setattr(workflow_module.workflow, "info", lambda: type("Info", (), {"workflow_id": "mvp-test"})())

    await _run_rechtsmethodik_and_insert(
        MVPWorkflowInput(project_id=project_id, jurabk="BNatSchG", paragraph_nr="§ 44")
    )

    assert "retry_policy" not in activity_options["get_norm_deconstruction"]
    assert child_workflows == [workflow_module.InsertRechtsmethodikResultsWorkflow.run]
