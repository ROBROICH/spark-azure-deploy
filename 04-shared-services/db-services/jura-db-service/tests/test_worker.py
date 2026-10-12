from jura_db.schemas.temporal import (
    ProcessRechtsprechungInput,
    ProcessRechtsprechungResult,
    RechtsprechungSpec,
)
from jura_db.workflows.update_rechtsprechung import UpdateRechtsprechungWorkflow
from temporal.contracts import (
    UpdateRechtsprechungInput,
    UpdateRechtsprechungOutput,
)
from temporal.registry import JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW
from temporalio import activity
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker


async def test_update_rechtsprechung_workflow_fans_out_and_aggregates_results() -> None:
    """End-to-end test: workflow lists TOC, snapshots existing doc_ids, then runs
    process_rechtsprechung for each spec and counts written vs skipped.
    """
    toc_specs = [
        RechtsprechungSpec(doc_id="doc_a"),
        RechtsprechungSpec(doc_id="doc_b"),
        RechtsprechungSpec(doc_id="doc_existing"),
        RechtsprechungSpec(doc_id="skip_me"),
    ]
    process_inputs: list[ProcessRechtsprechungInput] = []

    @activity.defn(name="list_rechtsprechung")
    async def fake_list_rechtsprechung() -> list[RechtsprechungSpec]:
        return toc_specs

    @activity.defn(name="query_existing_doc_ids")
    async def fake_query_existing_doc_ids() -> list[str]:
        return ["doc_existing"]

    @activity.defn(name="process_rechtsprechung")
    async def fake_process_rechtsprechung(
        input: ProcessRechtsprechungInput,
    ) -> ProcessRechtsprechungResult:
        process_inputs.append(input)
        if input.spec.doc_id == "skip_me":
            return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="skipped")
        if input.spec.doc_id in set(input.existing_doc_ids) and not input.overwrite:
            return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="skipped")
        return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="written")

    async with (
        await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env,
        Worker(
            env.client,
            task_queue=JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.task_queue,
            workflows=[UpdateRechtsprechungWorkflow],
            activities=[
                fake_list_rechtsprechung,
                fake_query_existing_doc_ids,
                fake_process_rechtsprechung,
            ],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
    ):
        result = await env.client.execute_workflow(
            JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.name,
            UpdateRechtsprechungInput(overwrite=False),
            id=f"test-{JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.name}",
            task_queue=JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.task_queue,
            result_type=UpdateRechtsprechungOutput,
        )

    assert {p.spec.doc_id for p in process_inputs} == {
        "doc_a",
        "doc_b",
        "doc_existing",
        "skip_me",
    }
    # Every per-doc activity sees the snapshot returned by query_existing_doc_ids.
    assert all(p.existing_doc_ids == ["doc_existing"] for p in process_inputs)
    assert all(p.overwrite is False for p in process_inputs)

    assert result.written == 2  # doc_a, doc_b
    assert result.skipped == 2  # doc_existing, skip_me


async def test_update_rechtsprechung_workflow_respects_max_documents() -> None:
    """When max_documents is set the workflow only fans out to that many specs."""
    process_inputs: list[ProcessRechtsprechungInput] = []

    @activity.defn(name="list_rechtsprechung")
    async def fake_list_rechtsprechung() -> list[RechtsprechungSpec]:
        return [RechtsprechungSpec(doc_id=f"doc_{i}") for i in range(5)]

    @activity.defn(name="query_existing_doc_ids")
    async def fake_query_existing_doc_ids() -> list[str]:
        return []

    @activity.defn(name="process_rechtsprechung")
    async def fake_process_rechtsprechung(
        input: ProcessRechtsprechungInput,
    ) -> ProcessRechtsprechungResult:
        process_inputs.append(input)
        if input.spec.doc_id == "doc_2":
            # Simulate a document that downloads but fails to parse.
            return ProcessRechtsprechungResult(
                doc_id=input.spec.doc_id,
                status="failed",
                error="could not parse document",
            )
        return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="written")

    async with (
        await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env,
        Worker(
            env.client,
            task_queue=JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.task_queue,
            workflows=[UpdateRechtsprechungWorkflow],
            activities=[
                fake_list_rechtsprechung,
                fake_query_existing_doc_ids,
                fake_process_rechtsprechung,
            ],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
    ):
        result = await env.client.execute_workflow(
            JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.name,
            UpdateRechtsprechungInput(overwrite=False, max_documents=3),
            id=f"test-max-{JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.name}",
            task_queue=JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.task_queue,
            result_type=UpdateRechtsprechungOutput,
        )

    assert {p.spec.doc_id for p in process_inputs} == {"doc_0", "doc_1", "doc_2"}
    assert result.written == 2  # doc_0, doc_1
    assert result.skipped == 0
    assert result.failed == 1  # doc_2
