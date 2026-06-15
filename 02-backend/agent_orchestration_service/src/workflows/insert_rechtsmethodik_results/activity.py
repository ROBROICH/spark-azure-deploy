from typing import Any
from uuid import UUID

from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowOutput
from temporalio import activity
from temporalio.exceptions import ApplicationError

from src.config.settings import NODE_FETCH_BATCH_SIZE
from src.services.api_clients import ExaminationServiceClient, PlsApiClient
from src.workflows.insert_rechtsmethodik_results.linking import (
    build_existing_absatz_ids_by_norm_and_nr,
    build_existing_gesetz_by_jurabk,
    build_existing_norm_by_gesetz_paragraph,
    build_existing_satz_keys,
    build_topic_norm_matches,
    normalize_norm_value,
    normalize_paragraph_nr,
    topic_norm_key,
)
from src.workflows.insert_rechtsmethodik_results.mapper import map_rechtsmethodik_result
from src.workflows.insert_rechtsmethodik_results.types import (
    ExaminationRechtsmethodikContext,
    InsertRechtsmethodikResultOutput,
    WriteRechtsmethodikResultInput,
)
from src.workflows.pls_topic_graph import TopicGraphScope


def _merge_parent_ids(existing: list[str], new: list[str]) -> list[str]:
    return sorted(set(existing) | set(new))


@activity.defn(name="fetch_pls_topic_norms")
async def _fetch_pls_topic_norms(project_id: UUID) -> list[dict[str, Any]]:
    """Fetch topic_norm data from PLS. Called once per workflow, not per norm."""
    pls_graph = await PlsApiClient.list_nodes(project_id)
    graph_nodes = pls_graph.get("nodes", [])
    topic_scope = TopicGraphScope.from_nodes(graph_nodes)
    topic_norm_refs = topic_scope.topic_norm_refs(graph_nodes)
    if not topic_norm_refs:
        return []

    topic_norms: list[dict[str, Any]] = []
    for offset in range(0, len(topic_norm_refs), NODE_FETCH_BATCH_SIZE):
        batch = await PlsApiClient.batch_get_nodes(
            project_id,
            topic_norm_refs[offset : offset + NODE_FETCH_BATCH_SIZE],
        )
        topic_norms.extend(batch.get("results", []))
    return topic_norms


@activity.defn(name="fetch_examination_rechtsmethodik_context")
async def _fetch_examination_rechtsmethodik_context(
    project_id: UUID,
) -> ExaminationRechtsmethodikContext:
    """Fetch existing gesetze/norms/absaetze/saetze for a project.

    Used inside the combined insert activity to deduplicate by current state
    before building the write payload.
    """
    graph = await ExaminationServiceClient.list_nodes(project_id)
    nodes = graph.get("nodes", [])

    async def _batch_by_type(node_type: str) -> list[dict[str, Any]]:
        refs = [{"node_type": node_type, "id": node["id"]} for node in nodes if node.get("node_type") == node_type]
        if not refs:
            return []
        batch = await ExaminationServiceClient.batch_get_nodes(project_id, refs)
        return batch.get("results", [])

    return ExaminationRechtsmethodikContext(
        gesetze=await _batch_by_type("gesetz"),
        norms=await _batch_by_type("norm"),
        absaetze=await _batch_by_type("absatz"),
        saetze=await _batch_by_type("satz"),
    )


def _build_inserts_and_updates(
    project_id: UUID,
    norm_result: RechtsmethodikWorkflowOutput,
    context: ExaminationRechtsmethodikContext,
    topic_norms: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], UUID, UUID]:
    topic_norm_lookup = build_topic_norm_matches(topic_norms)
    matches = topic_norm_lookup.get(
        topic_norm_key(norm_result.jurabk, norm_result.paragraph_nr),
        [],
    )
    if not matches:
        raise ApplicationError(
            f"No project topic_norm match found for {norm_result.jurabk} {norm_result.paragraph_nr}",
            non_retryable=True,
        )

    gesetz_parent_ids = sorted({f"{m.owner_node_type}:{m.owner_node_id}" for m in matches})
    norm_parent_ids = sorted({f"topic_norm:{m.topic_norm_id}" for m in matches})

    gesetz_by_jurabk = build_existing_gesetz_by_jurabk(context.gesetze)
    norm_by_gesetz_para = build_existing_norm_by_gesetz_paragraph(context.norms)
    absatz_ids_by_norm = build_existing_absatz_ids_by_norm_and_nr(context.absaetze)
    existing_satz_keys = build_existing_satz_keys(context.saetze)
    normalized_jurabk = normalize_norm_value(norm_result.jurabk)
    normalized_paragraph = normalize_paragraph_nr(norm_result.paragraph_nr)

    existing_gesetz = gesetz_by_jurabk.get(normalized_jurabk)
    existing_norm: dict[str, Any] | None = None
    existing_gesetz_id: UUID | None = None
    updates: list[dict[str, Any]] = []

    if existing_gesetz is not None:
        existing_gesetz_id = UUID(str(existing_gesetz["id"]))
        existing_gesetz_parents = existing_gesetz.get("frontend_parent_ids") or []
        merged_gesetz_parents = _merge_parent_ids(existing_gesetz_parents, gesetz_parent_ids)
        if set(merged_gesetz_parents) != set(existing_gesetz_parents):
            updates.append(
                {
                    "node_type": "gesetz",
                    "id": str(existing_gesetz_id),
                    "payload": {"frontend_parent_ids": merged_gesetz_parents},
                }
            )
        existing_norm = norm_by_gesetz_para.get((str(existing_gesetz_id), normalized_paragraph))

    existing_norm_id: UUID | None = None
    existing_absatz_ids_by_nr: dict[str, str] = {}
    if existing_norm is not None:
        existing_norm_id = UUID(str(existing_norm["id"]))
        existing_norm_parents = existing_norm.get("frontend_parent_ids") or []
        merged_norm_parents = _merge_parent_ids(existing_norm_parents, norm_parent_ids)
        if set(merged_norm_parents) != set(existing_norm_parents):
            updates.append(
                {
                    "node_type": "norm",
                    "id": str(existing_norm_id),
                    "payload": {"frontend_parent_ids": merged_norm_parents},
                }
            )
        existing_absatz_ids_by_nr = absatz_ids_by_norm.get(str(existing_norm_id), {})

    inserts, gesetz_id_str, norm_id_str = map_rechtsmethodik_result(
        project_id,
        norm_result,
        existing_gesetz_id=existing_gesetz_id,
        existing_norm_id=existing_norm_id,
        existing_absatz_ids_by_nr=existing_absatz_ids_by_nr or None,
        existing_satz_keys=existing_satz_keys or None,
        gesetz_frontend_parent_ids=gesetz_parent_ids if existing_gesetz_id is None else None,
        norm_frontend_parent_ids=norm_parent_ids if existing_norm_id is None else None,
    )

    return inserts, updates, UUID(gesetz_id_str), UUID(norm_id_str)


@activity.defn(name="insert_rechtsmethodik_result")
async def _insert_rechtsmethodik_result(
    args: WriteRechtsmethodikResultInput,
) -> InsertRechtsmethodikResultOutput:
    """Write a payload that was built in workflow context with workflow.uuid4."""
    if not args.inserts and not args.updates:
        return InsertRechtsmethodikResultOutput(
            gesetz_id=args.gesetz_id,
            norm_id=args.norm_id,
            skipped=True,
            nodes_inserted=0,
        )

    result = await ExaminationServiceClient.update_nodes(
        args.project_id,
        inserts=args.inserts,
        updates=args.updates,
    )
    return InsertRechtsmethodikResultOutput(
        gesetz_id=args.gesetz_id,
        norm_id=args.norm_id,
        skipped=False,
        nodes_inserted=len(result.get("inserted", [])),
    )
