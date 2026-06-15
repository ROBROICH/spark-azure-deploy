from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowOutput

from src.workflows.batch_mvp import workflow as workflow_module
from src.workflows.batch_mvp.types import (
    BatchMVPWorkflowInput,
    CachedNormDeconstructionBatchOutput,
    NormRef,
)
from src.workflows.insert_rechtsmethodik_results.types import InsertRechtsmethodikResultOutput
from src.workflows.mvp.types import MVPWorkflowOutput


def _activity_name(activity: Any) -> str:
    return getattr(activity, "__temporal_activity_definition").name


@pytest.mark.asyncio
async def test_batch_mvp_processes_cached_norms_before_fanning_out_uncached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    cached_rm = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[],
        regelungsgegenstand=None,
    )
    cached_insert = InsertRechtsmethodikResultOutput(
        gesetz_id=uuid4(),
        norm_id=uuid4(),
        skipped=False,
        nodes_inserted=2,
    )
    cached_output = MVPWorkflowOutput(
        project_id=project_id,
        jurabk="BNatSchG",
        paragraph_nr="§ 44",
        skipped=False,
        gesetz_id=cached_insert.gesetz_id,
        norm_id=cached_insert.norm_id,
    )
    uncached_output = MVPWorkflowOutput(
        project_id=project_id,
        jurabk="WHG",
        paragraph_nr="1",
        skipped=False,
        gesetz_id=uuid4(),
        norm_id=uuid4(),
    )
    mvp_inputs: list[Any] = []

    async def fake_execute_activity(activity: Any, arg: Any, **_kwargs: Any) -> Any:
        name = _activity_name(activity)
        if name == "fetch_project_norms":
            return [
                NormRef(jurabk="BNatSchG", paragraph_nr="44"),
                NormRef(jurabk="WHG", paragraph_nr="1"),
            ]
        if name == "process_cached_norm_deconstructions":
            return CachedNormDeconstructionBatchOutput(
                results=[cached_output],
                uncached_norms=[NormRef(jurabk="WHG", paragraph_nr="1")],
            )
        if name == "get_norm_deconstruction" and arg["jurabk"] == "BNatSchG":
            return cached_rm.model_dump()
        if name == "get_norm_deconstruction":
            return None
        raise AssertionError(f"Unexpected activity {name}")

    async def fake_execute_child_workflow(child_workflow: Any, arg: Any, **_kwargs: Any) -> Any:
        child_name = child_workflow if isinstance(child_workflow, str) else getattr(child_workflow, "__qualname__", "")
        if "InsertRechtsmethodikResultsWorkflow" in child_name:
            return [cached_insert]
        if child_workflow == "MVPWorkflow":
            mvp_inputs.append(arg)
            return uncached_output
        raise AssertionError(f"Unexpected child workflow {child_workflow}")

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(workflow_module.workflow, "execute_child_workflow", fake_execute_child_workflow)
    monkeypatch.setattr(
        workflow_module.workflow,
        "info",
        lambda: SimpleNamespace(workflow_id="batch-mvp-test"),
    )
    monkeypatch.setattr(
        workflow_module.workflow,
        "logger",
        SimpleNamespace(info=lambda *_, **__: None, error=lambda *_, **__: None),
    )

    result = await workflow_module.BatchMVPWorkflow().run(BatchMVPWorkflowInput(project_id=project_id))

    assert len(mvp_inputs) == 1
    assert mvp_inputs[0].jurabk == "WHG"
    assert mvp_inputs[0].paragraph_nr == "1"
    assert result.results == [cached_output, uncached_output]
