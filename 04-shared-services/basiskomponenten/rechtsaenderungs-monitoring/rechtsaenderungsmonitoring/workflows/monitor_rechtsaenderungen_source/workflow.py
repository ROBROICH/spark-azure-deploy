"""Workflow definition for ``MonitorRechtsaenderungenSourceWorkflow``.

Refreshes a single RSS feed source: pull the current entries, snapshot the
already-ingested document hashes, then parse + persist each entry through the
activities defined alongside the parent ``monitor_rechtsaenderungen`` package.
An optional ``entry_titles`` filter narrows the run to a subset of entries.
"""

from temporal.contracts import (
    FeedEntry,
    MonitorRechtsaenderungenInput,
    MonitorRechtsaenderungenOutput,
)
from temporal.registry import RECHTSAENDERUNGS_MONITORING_SOURCE_WORKFLOW
from temporal.utils import sliding_window
from temporalio import workflow

from rechtsaenderungsmonitoring.schemas.temporal import (
    NormFull,
    NormResult,
    ParseEntryInput,
    ParseEntryResult,
    PersistDocumentInput,
)
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen.activities import (
    extract_entry,
    fetch_feed_entries,
    get_norm_text,
    persist_document,
    query_existing_doc_ids,
    resolve_jurabks,
)
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen.llm import (
    categorise_title,
    enrich_changes,
    summarise_changes,
)


@workflow.defn(name=RECHTSAENDERUNGS_MONITORING_SOURCE_WORKFLOW.name)
class MonitorRechtsaenderungenSourceWorkflow:
    """Refresh the configured RSS feed for a single source."""

    @workflow.run
    async def run(self, input: MonitorRechtsaenderungenInput) -> MonitorRechtsaenderungenOutput:
        entries: list[FeedEntry] = await fetch_feed_entries(input.source)
        if input.entry_titles is not None:
            wanted = set(input.entry_titles)
            entries = [entry for entry in entries if entry.title in wanted]

        existing = await query_existing_doc_ids()

        async def process(entry: FeedEntry) -> ParseEntryResult:
            extracted = await extract_entry(
                ParseEntryInput(
                    source=input.source,
                    location=input.location,
                    entry=entry,
                    overwrite=input.overwrite,
                    existing_doc_ids=existing,
                )
            )
            if extracted.status == "skipped":
                return ParseEntryResult(title_hash=entry.title_hash, status="skipped", error="entry exists")

            affected_norms: list[NormResult] = []
            all_text = "\n".join([page.text for page in extracted.pages])
            summary = await summarise_changes(all_text)
            if summary.success:
                affected_norms.extend(summary.affected_norms)
            else:
                workflow.logger.warning(
                    "summarisation reported failure for %s",
                    entry.title_hash,
                )

            if not affected_norms:
                return ParseEntryResult(title_hash=entry.title_hash, status="skipped", error="no changes detected")

            full_norms: list[NormFull] = []

            # Resolve a jurabk once per distinct norm name; unknown names map to None.
            distinct_names = {norm.name for norm in affected_norms}
            name_to_jurabk = await resolve_jurabks(list(distinct_names))

            for norm in affected_norms:
                jurabk = name_to_jurabk.get(norm.name)
                if jurabk is None:
                    workflow.logger.warning("%s not found in gesetze-normen-db, skipping", norm.name)
                    continue

                current_text = await get_norm_text(jurabk, norm.paragraph_nr)
                if not current_text:
                    workflow.logger.error("no current text for %s %s, skipping", jurabk, norm.paragraph_nr)
                    continue

                template_norm = NormFull(
                    name=norm.name,
                    paragraph_nr=norm.paragraph_nr,
                    valid_from=norm.valid_from,
                    jurabk=jurabk,
                    change_text="",
                    current_text=current_text,
                    new_text="",
                )
                enriched = await enrich_changes(template_norm, norm.source_text)
                if enriched.success:
                    full_norms.extend(enriched.affected_norms)
                else:
                    workflow.logger.error("enrichment reported failure for %s %s", jurabk, norm.paragraph_nr)

            if not full_norms:
                return ParseEntryResult(
                    title_hash=entry.title_hash, status="skipped", error="no enrichable norms found"
                )

            doc_type = await categorise_title(extracted.description)

            return await persist_document(
                PersistDocumentInput(
                    title_hash=entry.title_hash,
                    title=entry.title,
                    doc_type=doc_type,
                    affected_norms=full_norms,
                    overwrite=input.overwrite,
                    valid_from=summary.valid_from,
                )
            )

        results = await sliding_window(items=entries, fn=process, concurrency=5)

        return MonitorRechtsaenderungenOutput(
            written=sum(1 for r in results if r.status == "written"),
            skipped=sum(1 for r in results if r.status == "skipped"),
            failed=sum(1 for r in results if r.status == "failed"),
        )
