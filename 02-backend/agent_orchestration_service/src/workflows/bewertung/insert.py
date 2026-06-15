"""Child 2: InsertBewertungResultsWorkflow + insert activity."""

from datetime import timedelta
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from temporal.utils import sliding_window
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.workflows.bewertung.mapper import map_bewertung_result
from src.workflows.bewertung.types import (
    InsertBewertungInput,
    InsertBewertungOutput,
    InsertBewertungSatzOutput,
    SatzBewertungResult,
)
from src.workflows.result_insertion import (
    delete_stale_bewertungen_for_satz,
    fetch_existing_nodes,
    insert_nodes_idempotent,
    node_ref,
)

api_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=10),
)


class WriteBewertungSatzInput(BaseModel):
    project_id: UUID
    satz_id: str
    bewertung_id: str
    inserts: list[dict[str, Any]]


async def _sanitize_bewertung_inserts(
    project_id: Any,
    inserts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    quelle_inserts = [insert for insert in inserts if insert["node_type"] == "bewertung_quelle"]
    if not quelle_inserts:
        return inserts

    refs: list[dict[str, str]] = []
    for insert in quelle_inserts:
        payload = insert["payload"]
        dokument_id = payload.get("dokument_id")
        fundstelle_id = payload.get("fundstelle_id")
        if dokument_id:
            refs.append(node_ref("dokument", dokument_id))
        if fundstelle_id:
            refs.append(node_ref("fundstelle", fundstelle_id))

    existing = await fetch_existing_nodes(project_id, refs)
    existing_ids_by_type: dict[str, set[str]] = {}
    for node in existing:
        node_type = str(node["node_type"])
        existing_ids_by_type.setdefault(node_type, set()).add(str(node["id"]))

    sanitized: list[dict[str, Any]] = []
    for insert in inserts:
        if insert["node_type"] != "bewertung_quelle":
            sanitized.append(insert)
            continue

        payload = dict(insert["payload"])
        dokument_id = payload.get("dokument_id")
        if not dokument_id or dokument_id not in existing_ids_by_type.get("dokument", set()):
            continue

        fundstelle_id = payload.get("fundstelle_id")
        if fundstelle_id and fundstelle_id not in existing_ids_by_type.get("fundstelle", set()):
            payload["fundstelle_id"] = None

        sanitized.append({**insert, "payload": payload})

    return sanitized


# =============================================================================
# ACTIVITY
# =============================================================================


@activity.defn(name="write_bewertung_satz_result")
async def _write_bewertung_satz_result(input: WriteBewertungSatzInput) -> InsertBewertungSatzOutput:
    """Sanitize optional FKs and write the pre-built Bewertung inserts."""
    await delete_stale_bewertungen_for_satz(input.project_id, input.satz_id)
    sanitized = await _sanitize_bewertung_inserts(input.project_id, input.inserts)
    result = await insert_nodes_idempotent(input.project_id, sanitized)

    return InsertBewertungSatzOutput(
        satz_id=input.satz_id,
        bewertung_id=input.bewertung_id,
        nodes_inserted=len(result.get("inserted", [])),
        skipped=False,
    )


# =============================================================================
# CHILD WORKFLOW
# =============================================================================


@workflow.defn(name="InsertBewertungResultsWorkflow")
class InsertBewertungResultsWorkflow:
    """Child 2: Insert all Satz bewertung results into examination service."""

    @workflow.run
    async def run(self, input: InsertBewertungInput) -> InsertBewertungOutput:
        if not input.satz_outputs:
            return InsertBewertungOutput(satz_results=[])

        async def _insert_one(satz_output: SatzBewertungResult) -> InsertBewertungSatzOutput:
            bewertung_id, inserts = map_bewertung_result(
                satz_output.bewertung_output,
                satz_output.satz_id,
            )
            if not inserts:
                return InsertBewertungSatzOutput(
                    satz_id=satz_output.satz_id,
                    bewertung_id="",
                    nodes_inserted=0,
                    skipped=True,
                )

            return await workflow.execute_activity(
                _write_bewertung_satz_result,
                WriteBewertungSatzInput(
                    project_id=input.project_id,
                    satz_id=satz_output.satz_id,
                    bewertung_id=bewertung_id,
                    inserts=inserts,
                ),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=api_retry_policy,
            )

        results = await sliding_window(input.satz_outputs, _insert_one, concurrency=10)
        return InsertBewertungOutput(satz_results=results)
