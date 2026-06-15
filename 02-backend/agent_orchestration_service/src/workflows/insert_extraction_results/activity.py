from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from uuid import UUID

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.services.api_clients import ExaminationServiceClient
from src.workflows.insert_extraction_results.types import (
    BatchInsertExtractionInput,
    BatchInsertExtractionOutput,
    DocumentExtractionEntry,
    InsertDocumentExtractionOutput,
)

api_write_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=3),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=30),
)

DOCUMENT_EXTRACTION_DEPENDENT_NODE_TYPES = frozenset(
    {"chunk", "sub_chunk", "sub_chunk_text", "sub_chunk_table", "sub_chunk_image", "sub_chunk_relation"}
)

EXTRACTION_BATCH_SIZE = 50


def _collect_dependent_refs(
    graph_nodes: list[dict[str, Any]],
    root_refs: list[dict[str, str]],
) -> list[dict[str, str]]:
    """BFS from root_refs through children, collecting extraction-dependent nodes."""
    children_by_parent: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for node in graph_nodes:
        for parent in node.get("parents", []):
            children_by_parent.setdefault((str(parent["node_type"]), str(parent["id"])), []).append(node)

    delete_refs_by_key: dict[tuple[str, str], dict[str, str]] = {}
    queue = [
        child
        for root_ref in root_refs
        for child in children_by_parent.get((str(root_ref["node_type"]), str(root_ref["id"])), [])
    ]

    while queue:
        current = queue.pop()
        if current.get("node_type") not in DOCUMENT_EXTRACTION_DEPENDENT_NODE_TYPES:
            continue
        key = (str(current["node_type"]), str(current["id"]))
        if key in delete_refs_by_key:
            continue
        delete_refs_by_key[key] = {"node_type": str(current["node_type"]), "id": str(current["id"])}
        if current["node_type"] == "sub_chunk":
            for parent_ref in current.get("parents", []):
                if parent_ref["node_type"] == "markdown_text":
                    md_key = (str(parent_ref["node_type"]), str(parent_ref["id"]))
                    delete_refs_by_key[md_key] = {
                        "node_type": str(parent_ref["node_type"]),
                        "id": str(parent_ref["id"]),
                    }
        queue.extend(children_by_parent.get(key, []))

    return list(delete_refs_by_key.values())


@dataclass
class _GraphState:
    """Project graph snapshot shared by all batches of one activity attempt.

    Loaded once per attempt and updated in memory after each committed batch
    write. A Temporal retry re-runs the whole activity and reloads it fresh,
    so already-written documents are skipped via ``fresh_file_ids`` /
    ``all_existing_ids`` exactly as with a re-read.
    """

    graph_nodes: list[dict[str, Any]] = field(default_factory=list)
    all_existing_ids: set[str] = field(default_factory=set)
    dokumente_by_id: dict[str, dict[str, Any]] = field(default_factory=dict)
    fresh_file_ids: set[str] = field(default_factory=set)
    stale_dokument_ids_by_file: dict[str, list[str]] = field(default_factory=dict)
    deleted_keys: set[tuple[str, str]] = field(default_factory=set)


async def _load_graph_state(project_id: UUID) -> _GraphState:
    graph = await ExaminationServiceClient.list_nodes(project_id)
    graph_nodes: list[dict[str, Any]] = graph.get("nodes", [])

    dokument_refs = [n for n in graph_nodes if n.get("node_type") == "dokument"]
    existing_dokumente: list[dict[str, Any]] = []
    if dokument_refs:
        batch_result = await ExaminationServiceClient.batch_get_nodes(
            project_id,
            [{"node_type": "dokument", "id": n["id"]} for n in dokument_refs],
        )
        existing_dokumente = batch_result.get("results", [])

    state = _GraphState(
        graph_nodes=graph_nodes,
        all_existing_ids={str(n["id"]) for n in graph_nodes},
        dokumente_by_id={str(d["id"]): d for d in existing_dokumente},
        fresh_file_ids={
            str(doc.get("dms_file_id"))
            for doc in existing_dokumente
            if doc.get("dms_file_id") and not doc.get("is_outdated")
        },
    )
    for doc in existing_dokumente:
        if doc.get("is_outdated") and doc.get("dms_file_id"):
            state.stale_dokument_ids_by_file.setdefault(str(doc["dms_file_id"]), []).append(str(doc["id"]))
    return state


def _undeleted_refs(refs: list[dict[str, str]], state: _GraphState) -> list[dict[str, str]]:
    return [r for r in refs if (r["node_type"], r["id"]) not in state.deleted_keys]


async def _process_extraction_batch(
    project_id: UUID,
    entries: list[DocumentExtractionEntry],
    state: _GraphState,
) -> list[InsertDocumentExtractionOutput]:
    """Compute + Write for a single batch of documents.

    Already-processed documents (``is_outdated=False``) are skipped.
    """
    if not entries:
        return []

    # ── 1. COMPUTE: collect operations per document ───────────────────
    all_inserts: list[dict[str, Any]] = []
    all_updates: list[dict[str, Any]] = []
    all_deletes: list[dict[str, str]] = []
    results: list[InsertDocumentExtractionOutput] = []
    written_file_ids: set[str] = set()

    for entry in entries:
        sfid = str(entry.source_file_id) if entry.source_file_id else None

        # Skip: already processed (is_outdated=False → fresh)
        if sfid and sfid in state.fresh_file_ids:
            results.append(
                InsertDocumentExtractionOutput(
                    dokument_id=entry.dokument_id,
                    skipped=True,
                    nodes_inserted=0,
                )
            )
            continue

        replace_existing = (
            entry.has_dokument_id_override and sfid is not None and sfid in state.stale_dokument_ids_by_file
        )

        if replace_existing:
            # ── Replace mode: delete old subgraph, update root ────────
            root_ref = {"node_type": "dokument", "id": str(entry.dokument_id)}
            dependent_refs = _collect_dependent_refs(state.graph_nodes, [root_ref])
            all_deletes.extend(_undeleted_refs(dependent_refs, state))

            existing_dok = state.dokumente_by_id.get(str(entry.dokument_id))
            if existing_dok and existing_dok.get("markdown_text_id"):
                md_ref = {"node_type": "markdown_text", "id": str(existing_dok["markdown_text_id"])}
                all_deletes.extend(_undeleted_refs([md_ref], state))

            dokument_insert = next((i for i in entry.inserts if i["node_type"] == "dokument"), None)
            if dokument_insert is None:
                raise ValueError("Replacement inserts missing 'dokument' node")

            all_updates.append(
                {
                    "node_type": "dokument",
                    "id": str(entry.dokument_id),
                    "payload": {**dokument_insert["payload"], "is_outdated": False},
                }
            )

            child_inserts = [i for i in entry.inserts if i["node_type"] != "dokument"]
            new_child_inserts = [i for i in child_inserts if i["id"] not in state.all_existing_ids]
            all_inserts.extend(new_child_inserts)

            if sfid:
                written_file_ids.add(sfid)
            results.append(
                InsertDocumentExtractionOutput(
                    dokument_id=entry.dokument_id,
                    skipped=False,
                    nodes_inserted=len(new_child_inserts) + 1,
                )
            )

        else:
            # ── Insert mode: delete stale subgraph, insert new nodes ──
            if sfid and sfid in state.stale_dokument_ids_by_file:
                stale_roots = [
                    {"node_type": "dokument", "id": dok_id} for dok_id in state.stale_dokument_ids_by_file[sfid]
                ]
                stale_deps = _collect_dependent_refs(state.graph_nodes, stale_roots)
                all_deletes.extend(_undeleted_refs(stale_deps, state))

            new_inserts = [i for i in entry.inserts if i["id"] not in state.all_existing_ids]
            if not new_inserts:
                results.append(
                    InsertDocumentExtractionOutput(
                        dokument_id=entry.dokument_id,
                        skipped=True,
                        nodes_inserted=0,
                    )
                )
                continue

            all_inserts.extend(new_inserts)
            if sfid:
                written_file_ids.add(sfid)
            results.append(
                InsertDocumentExtractionOutput(
                    dokument_id=entry.dokument_id,
                    skipped=False,
                    nodes_inserted=len(new_inserts),
                )
            )

    # ── 2. WRITE: single call per batch (atomic DB transaction) ───────
    unique_deletes = list({(d["node_type"], d["id"]): d for d in all_deletes}.values())

    if all_inserts or all_updates or unique_deletes:
        await ExaminationServiceClient.update_nodes(
            project_id,
            inserts=all_inserts,
            updates=all_updates,
            deletes=unique_deletes,
        )
        # The write committed atomically — make its effects visible to the
        # remaining batches of this attempt.
        state.all_existing_ids.update(str(i["id"]) for i in all_inserts)
        state.deleted_keys.update((d["node_type"], d["id"]) for d in unique_deletes)
        state.fresh_file_ids.update(written_file_ids)

    return results


@activity.defn(name="batch_insert_extraction_nodes")
async def _batch_insert_extraction_nodes(
    args: BatchInsertExtractionInput,
) -> BatchInsertExtractionOutput:
    if not args.entries:
        return BatchInsertExtractionOutput(results=[])

    state = await _load_graph_state(args.project_id)

    results: list[InsertDocumentExtractionOutput] = []
    for offset in range(0, len(args.entries), EXTRACTION_BATCH_SIZE):
        batch_entries = args.entries[offset : offset + EXTRACTION_BATCH_SIZE]
        batch_results = await _process_extraction_batch(args.project_id, batch_entries, state)
        results.extend(batch_results)

    return BatchInsertExtractionOutput(results=results)


async def batch_insert_extraction_nodes(
    args: BatchInsertExtractionInput,
) -> BatchInsertExtractionOutput:
    """Wrapper that executes _batch_insert_extraction_nodes as a workflow activity."""
    return await workflow.execute_activity(
        _batch_insert_extraction_nodes,
        args,
        # Must exceed the httpx client timeout (settings.api.timeout, 600s) so a
        # single slow call cannot consume the whole attempt; matches BatchMVP's
        # process_cached_norm_deconstructions budget.
        start_to_close_timeout=timedelta(minutes=30),
        retry_policy=api_write_retry_policy,
    )
