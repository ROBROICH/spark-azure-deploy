import json
from datetime import datetime

from rechtsaenderungsmonitoring.schemas.temporal import (
    ExtractEntryResult,
    PageText,
    ParseEntryInput,
    ParseEntryResult,
    PersistDocumentInput,
)
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen import (
    MonitorRechtsaenderungenWorkflow,
)
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen_source import (
    MonitorRechtsaenderungenSourceWorkflow,
)
from temporal.activities.models import LlmActivityInput
from temporal.workflows.rechtsaenderungs_monitoring.monitor_rechtsaenderungen import (
    MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
    TASK_QUEUE,
)
from temporal.workflows.rechtsaenderungs_monitoring.types import (
    FeedEntry,
    MonitorRechtsaenderungenInput,
    MonitorRechtsaenderungenOutput,
    Source,
)
from temporalio import activity
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

# The shared LLM helpers dispatch ``llm_invoke`` to the queue resolved from the
# model name; ``self-hosted/*`` -> ``llm-custom``.
LLM_TASK_QUEUE = "llm-custom"


@activity.defn(name="llm_invoke")
async def fake_llm_invoke(input: LlmActivityInput) -> str:
    """Return schema-valid JSON for whichever structured call is requested."""
    if input.schema_name == "CategorisationResult":
        return json.dumps({"category": "Gesetz"})
    if input.schema_name == "SummaryResponse":
        # One affected norm so the workflow proceeds to jurabk/text/enrichment.
        return json.dumps(
            {
                "success": True,
                "affected_norms": [
                    {
                        "name": "Testgesetz",
                        "paragraph_nr": "1",
                        "source_text": "In § 1 werden die Wörter ... ersetzt.",
                    }
                ],
                "valid_from": "2026-05-01",
            }
        )
    if input.schema_name == "EnrichmentResponse":
        return json.dumps(
            {
                "success": True,
                "affected_norms": [
                    {
                        "name": "Testgesetz",
                        "paragraph_nr": "1",
                        "jurabk": "TestG",
                        "change_text": "In § 1 werden die Wörter ... ersetzt.",
                        "current_text": "alter Gesetzestext",
                        "new_text": "neuer Gesetzestext",
                    }
                ],
            }
        )
    return json.dumps({"success": True, "affected_norms": []})


@activity.defn(name="resolve_jurabks")
async def fake_resolve_jurabks(names: list[str]) -> dict[str, str | None]:
    """Resolve every requested norm name to a stub jurabk."""
    return dict.fromkeys(names, "TestG")


@activity.defn(name="get_norm_text")
async def fake_get_norm_text(jurabk: str, paragraph_nr: str) -> str | None:
    """Return stub current text for any norm paragraph."""
    return "alter Gesetzestext"


async def test_monitor_rechtsaenderungen_workflow_fetches_feed_and_aggregates_results() -> None:
    """End-to-end test: the workflow extracts each feed entry, runs the LLM steps
    on the shared ``llm-custom`` queue, persists the result, and aggregates the
    status counts. The existing-doc snapshot is threaded through every extract.
    """
    extract_inputs: list[ParseEntryInput] = []
    persist_inputs: list[PersistDocumentInput] = []

    feed_entries = [
        FeedEntry(
            title="Erstes Aenderungsgesetz",
            title_hash="hash_a",
            link="https://example.invalid/a",
            guid="guid_a",
            description="desc a",
            pub_date=datetime(2026, 5, 1),
        ),
        FeedEntry(
            title="Zweites Aenderungsgesetz",
            title_hash="hash_b",
            link="https://example.invalid/b",
            guid="guid_b",
            description="desc b",
            pub_date=datetime(2026, 5, 2),
        ),
        FeedEntry(
            title="Drittes Aenderungsgesetz",
            title_hash="hash_skip",
            link="https://example.invalid/c",
            guid="guid_c",
            description="desc c",
            pub_date=datetime(2026, 5, 3),
        ),
    ]

    @activity.defn(name="fetch_feed_entries")
    async def fake_fetch_feed_entries(source: Source) -> list[FeedEntry]:
        assert source == Source.BUND
        return feed_entries

    @activity.defn(name="query_existing_doc_ids")
    async def fake_query_existing_doc_ids() -> list[str]:
        return ["existing_doc_id_1"]

    @activity.defn(name="extract_entry")
    async def fake_extract_entry(input: ParseEntryInput) -> ExtractEntryResult:
        extract_inputs.append(input)
        # mark one entry as "skipped" to verify count aggregation
        if input.entry.title_hash == "hash_skip":
            return ExtractEntryResult(title_hash=input.entry.title_hash, status="skipped")
        return ExtractEntryResult(
            title_hash=input.entry.title_hash,
            title=input.entry.title,
            description=input.entry.description,
            pages=[PageText(page_nr=0, text="some change text")],
            status="extracted",
        )

    @activity.defn(name="persist_document")
    async def fake_persist_document(input: PersistDocumentInput) -> ParseEntryResult:
        persist_inputs.append(input)
        return ParseEntryResult(
            title_hash=input.title_hash,
            doc_id=input.title_hash.upper(),
            status="written",
        )

    async with (
        await WorkflowEnvironment.start_local(
            data_converter=pydantic_data_converter,
        ) as env,
        Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[
                MonitorRechtsaenderungenWorkflow,
                MonitorRechtsaenderungenSourceWorkflow,
            ],
            activities=[
                fake_fetch_feed_entries,
                fake_query_existing_doc_ids,
                fake_extract_entry,
                fake_resolve_jurabks,
                fake_get_norm_text,
                fake_persist_document,
            ],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
        Worker(
            env.client,
            task_queue=LLM_TASK_QUEUE,
            activities=[fake_llm_invoke],
        ),
    ):
        result = await env.client.execute_workflow(
            MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
            [MonitorRechtsaenderungenInput(source=Source.BUND, overwrite=False)],
            id=f"test-{MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID}",
            task_queue=TASK_QUEUE,
            result_type=MonitorRechtsaenderungenOutput,
        )

    # Every fetched entry hits extract_entry exactly once, in any order.
    assert {p.entry.title_hash for p in extract_inputs} == {"hash_a", "hash_b", "hash_skip"}

    # Every extract activity receives the snapshot from query_existing_doc_ids.
    assert all(p.existing_doc_ids == ["existing_doc_id_1"] for p in extract_inputs)
    assert all(p.overwrite is False for p in extract_inputs)
    assert all(p.source == Source.BUND for p in extract_inputs)

    # Only the two non-skipped entries are persisted, with the categorised type.
    assert {p.title_hash for p in persist_inputs} == {"hash_a", "hash_b"}
    assert all(p.doc_type.value == "Gesetz" for p in persist_inputs)

    # The enriched norm (jurabk + current/new text) is threaded into persist.
    persisted_norms = [norm for p in persist_inputs for norm in p.affected_norms]
    assert len(persisted_norms) == 2
    assert all(norm.jurabk == "TestG" for norm in persisted_norms)
    assert all(norm.current_text == "alter Gesetzestext" for norm in persisted_norms)
    assert all(norm.new_text == "neuer Gesetzestext" for norm in persisted_norms)

    assert result.written == 2
    assert result.skipped == 1
    assert result.failed == 0


async def test_monitor_rechtsaenderungen_workflow_filters_by_entry_titles() -> None:
    """When ``entry_titles`` is set, only matching entries are extracted."""
    extract_inputs: list[ParseEntryInput] = []

    feed_entries = [
        FeedEntry(
            title="Entry A",
            title_hash="hash_a",
            link="https://example.invalid/a",
            guid="guid_a",
            description="",
            pub_date=datetime(2026, 5, 1),
        ),
        FeedEntry(
            title="Entry B",
            title_hash="hash_b",
            link="https://example.invalid/b",
            guid="guid_b",
            description="",
            pub_date=datetime(2026, 5, 2),
        ),
    ]

    @activity.defn(name="fetch_feed_entries")
    async def fake_fetch_feed_entries(source: Source) -> list[FeedEntry]:
        return feed_entries

    @activity.defn(name="query_existing_doc_ids")
    async def fake_query_existing_doc_ids() -> list[str]:
        return []

    @activity.defn(name="extract_entry")
    async def fake_extract_entry(input: ParseEntryInput) -> ExtractEntryResult:
        extract_inputs.append(input)
        return ExtractEntryResult(
            title_hash=input.entry.title_hash,
            title=input.entry.title,
            description=input.entry.description,
            pages=[PageText(page_nr=0, text="some change text")],
            status="extracted",
        )

    @activity.defn(name="persist_document")
    async def fake_persist_document(input: PersistDocumentInput) -> ParseEntryResult:
        return ParseEntryResult(
            title_hash=input.title_hash,
            doc_id=input.title_hash.upper(),
            status="written",
        )

    async with (
        await WorkflowEnvironment.start_local(
            data_converter=pydantic_data_converter,
        ) as env,
        Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[
                MonitorRechtsaenderungenWorkflow,
                MonitorRechtsaenderungenSourceWorkflow,
            ],
            activities=[
                fake_fetch_feed_entries,
                fake_query_existing_doc_ids,
                fake_extract_entry,
                fake_resolve_jurabks,
                fake_get_norm_text,
                fake_persist_document,
            ],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
        Worker(
            env.client,
            task_queue=LLM_TASK_QUEUE,
            activities=[fake_llm_invoke],
        ),
    ):
        result = await env.client.execute_workflow(
            MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
            [
                MonitorRechtsaenderungenInput(
                    source=Source.BUND,
                    entry_titles=["Entry B"],
                )
            ],
            id=f"test-{MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID}-filtered",
            task_queue=TASK_QUEUE,
            result_type=MonitorRechtsaenderungenOutput,
        )

    assert [p.entry.title_hash for p in extract_inputs] == ["hash_b"]
    assert result.written == 1
    assert result.skipped == 0
    assert result.failed == 0
