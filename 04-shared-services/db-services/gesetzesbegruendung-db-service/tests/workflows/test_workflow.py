"""Temporal workflow integration tests for UpdateBegruendungenWorkflow."""

from typing import Any

from begruendungen_db.workflows.update_begruendungen.workflow import UpdateBegruendungenWorkflow
from begruendungen_db.workflows.update_begruendungen_law_doc.workflow import UpdateBegruendungenLawDocWorkflow
from begruendungen_db.workflows.update_begruendungen_source.workflow import UpdateBegruendungenSourceWorkflow
from temporal.contracts import (
    BegruendungenSource,
    GNDocData,
    Hierarchy,
    ProcessLawDocInput,
    ProcessSingleDocInput,
    ProcessSingleDocResult,
    SourceConfigInput,
    UpdateBegruendungenInput,
    UpdateBegruendungenOutput,
)
from temporal.registry import BEGRUENDUNGEN_UPDATE_WORKFLOW
from temporalio import activity
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

_ALL_WORKFLOWS = [
    UpdateBegruendungenWorkflow,
    UpdateBegruendungenSourceWorkflow,
    UpdateBegruendungenLawDocWorkflow,
]


async def test_workflow_fans_out_and_aggregates_written_skipped_failed() -> None:
    """Top-level workflow fans out one sub-workflow per source config, aggregates counts."""
    law_docs = [
        GNDocData(
            jurabk="UVPG",
            kurzue="UVPG",
            langue="Gesetz über die Umweltverträglichkeitsprüfung",
            hierarchy=Hierarchy.BUND,
        ),
        GNDocData(jurabk="BNatSchG", kurzue="BNatSchG", langue="Bundesnaturschutzgesetz", hierarchy=Hierarchy.BUND),
        GNDocData(jurabk="KrWG", kurzue="KrWG", langue="Kreislaufwirtschaftsgesetz", hierarchy=Hierarchy.BUND),
    ]
    doc_metas: dict[str, list[dict[str, Any]]] = {
        "UVPG": [{"id": "100", "drucksachetyp": "Gesetzentwurf", "pdf_url": "http://example.com/a.pdf"}],
        "BNatSchG": [{"id": "200", "drucksachetyp": "Gesetzentwurf", "pdf_url": None}],
        "KrWG": [],
    }

    @activity.defn(name="list_law_docs")
    async def fake_list_law_docs(hierarchy: str, bundesland: str | None = None) -> list[GNDocData]:
        return law_docs

    @activity.defn(name="fetch_law_docs")
    async def fake_fetch_law_docs(input: ProcessLawDocInput) -> list[dict[str, Any]]:
        return doc_metas[input.law_doc.jurabk]

    process_calls: list[ProcessSingleDocInput] = []

    @activity.defn(name="process_law_doc")
    async def fake_process_law_doc(input: ProcessSingleDocInput) -> ProcessSingleDocResult:
        process_calls.append(input)
        if input.document_meta.pdf_url is None:
            return ProcessSingleDocResult(
                jurabk=input.law_doc.jurabk,
                status="skipped",
                error="no pdf",
            )
        return ProcessSingleDocResult(jurabk=input.law_doc.jurabk, status="written")

    async with (
        await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env,
        Worker(
            env.client,
            task_queue=BEGRUENDUNGEN_UPDATE_WORKFLOW.task_queue,
            workflows=_ALL_WORKFLOWS,
            activities=[fake_list_law_docs, fake_fetch_law_docs, fake_process_law_doc],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
    ):
        result = await env.client.execute_workflow(
            BEGRUENDUNGEN_UPDATE_WORKFLOW.name,
            UpdateBegruendungenInput(
                sources=[
                    SourceConfigInput(
                        source=BegruendungenSource.DIP_DRUCK,
                        hierarchy=Hierarchy.BUND,
                    )
                ],
            ),
            id=f"test-{BEGRUENDUNGEN_UPDATE_WORKFLOW.name}",
            task_queue=BEGRUENDUNGEN_UPDATE_WORKFLOW.task_queue,
            result_type=UpdateBegruendungenOutput,
        )

    assert {c.law_doc.jurabk for c in process_calls} == {"UVPG", "BNatSchG"}
    assert result.written == 1  # UVPG
    assert result.skipped == 1  # BNatSchG (no pdf)
    assert result.failed == 0


async def test_workflow_aggregates_across_multiple_sources() -> None:
    """Written/skipped/failed counts are summed across all source configs."""

    @activity.defn(name="list_law_docs")
    async def fake_list_law_docs(hierarchy: str, bundesland: str | None = None) -> list[GNDocData]:
        return [
            GNDocData(jurabk="LAW_A", kurzue="LAW_A", langue="Law A", hierarchy=Hierarchy(hierarchy)),
        ]

    @activity.defn(name="fetch_law_docs")
    async def fake_fetch_law_docs(input: ProcessLawDocInput) -> list[dict[str, Any]]:
        return [{"id": "1", "drucksachetyp": "Gesetzentwurf", "pdf_url": "http://example.com/x.pdf"}]

    call_count = 0

    @activity.defn(name="process_law_doc")
    async def fake_process_law_doc(input: ProcessSingleDocInput) -> ProcessSingleDocResult:
        nonlocal call_count
        call_count += 1
        status = "written" if call_count % 2 == 1 else "failed"
        return ProcessSingleDocResult(jurabk=input.law_doc.jurabk, status=status)

    async with (
        await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env,
        Worker(
            env.client,
            task_queue=BEGRUENDUNGEN_UPDATE_WORKFLOW.task_queue,
            workflows=_ALL_WORKFLOWS,
            activities=[fake_list_law_docs, fake_fetch_law_docs, fake_process_law_doc],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
    ):
        result = await env.client.execute_workflow(
            BEGRUENDUNGEN_UPDATE_WORKFLOW.name,
            UpdateBegruendungenInput(
                sources=[
                    SourceConfigInput(
                        source=BegruendungenSource.DIP_DRUCK,
                        hierarchy=Hierarchy.BUND,
                    ),
                    SourceConfigInput(
                        source=BegruendungenSource.DIP_DRUCK,
                        hierarchy=Hierarchy.EU,
                    ),
                ],
            ),
            id=f"test-multi-source-{BEGRUENDUNGEN_UPDATE_WORKFLOW.name}",
            task_queue=BEGRUENDUNGEN_UPDATE_WORKFLOW.task_queue,
            result_type=UpdateBegruendungenOutput,
        )

    expected_call_count = 2
    # Two sources, one law each, and one document each.
    assert call_count == expected_call_count
    assert result.written == 1
    assert result.failed == 1
    assert result.skipped == 0
