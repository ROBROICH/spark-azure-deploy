from typing import Any
from uuid import UUID

from pydantic import ValidationError
from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowOutput

from src.config.settings import NODE_FETCH_BATCH_SIZE
from src.services.api_clients import ExaminationServiceClient, PlsApiClient
from src.workflows.batch_mvp.types import (
    CachedNormDeconstructionBatchOutput,
    NormRef,
    TopicNormRef,
)
from src.workflows.insert_rechtsmethodik_results.activity import _build_inserts_and_updates
from src.workflows.insert_rechtsmethodik_results.linking import (
    normalize_norm_value,
    normalize_paragraph_nr,
    topic_norm_key,
)
from src.workflows.insert_rechtsmethodik_results.types import ExaminationRechtsmethodikContext
from src.workflows.mvp.types import MVPWorkflowOutput
from src.workflows.pls_topic_graph import TopicGraphScope


def _node_has_parent(node: dict[str, Any], node_type: str, parent_ids: set[str]) -> bool:
    return any(
        parent.get("node_type") == node_type and str(parent.get("id")) in parent_ids
        for parent in node.get("parents", [])
    )


async def _batch_get_examination_nodes(project_id: UUID, refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for offset in range(0, len(refs), NODE_FETCH_BATCH_SIZE):
        batch = await ExaminationServiceClient.batch_get_nodes(
            project_id,
            refs[offset : offset + NODE_FETCH_BATCH_SIZE],
        )
        results.extend(batch.get("results", []))
    return results


async def _fetch_pls_topic_norms(project_id: UUID) -> list[dict[str, Any]]:
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


async def _fetch_examination_context_for_norms(
    project_id: UUID,
    norms: list[NormRef],
) -> ExaminationRechtsmethodikContext:
    graph = await ExaminationServiceClient.list_nodes(project_id)
    graph_nodes = graph.get("nodes", [])

    paragraphs_by_jurabk: dict[str, set[str]] = {}
    for norm in norms:
        paragraphs_by_jurabk.setdefault(
            normalize_norm_value(norm.jurabk),
            set(),
        ).add(normalize_paragraph_nr(norm.paragraph_nr))

    gesetz_refs = [
        {"node_type": "gesetz", "id": node["id"]}
        for node in graph_nodes
        if node.get("node_type") == "gesetz" and node.get("id") is not None
    ]
    gesetze = [
        gesetz
        for gesetz in await _batch_get_examination_nodes(project_id, gesetz_refs)
        if normalize_norm_value(str(gesetz.get("jurabk", ""))) in paragraphs_by_jurabk
    ]
    if not gesetze:
        return ExaminationRechtsmethodikContext()

    gesetze_by_id = {str(gesetz["id"]): gesetz for gesetz in gesetze if gesetz.get("id") is not None}
    norm_refs = [
        {"node_type": "norm", "id": node["id"]}
        for node in graph_nodes
        if node.get("node_type") == "norm"
        and node.get("id") is not None
        and _node_has_parent(node, "gesetz", set(gesetze_by_id))
    ]
    existing_norms = []
    for norm in await _batch_get_examination_nodes(project_id, norm_refs):
        gesetz = gesetze_by_id.get(str(norm.get("gesetz_id")))
        if gesetz is None:
            continue
        jurabk = normalize_norm_value(str(gesetz.get("jurabk", "")))
        paragraph = normalize_paragraph_nr(str(norm.get("paragraph_nr", "")))
        if paragraph in paragraphs_by_jurabk.get(jurabk, set()):
            existing_norms.append(norm)

    norm_ids = {str(norm["id"]) for norm in existing_norms if norm.get("id") is not None}
    absatz_refs = [
        {"node_type": "absatz", "id": node["id"]}
        for node in graph_nodes
        if node.get("node_type") == "absatz" and node.get("id") is not None and _node_has_parent(node, "norm", norm_ids)
    ]
    absaetze = await _batch_get_examination_nodes(project_id, absatz_refs)

    absatz_ids = {str(absatz["id"]) for absatz in absaetze if absatz.get("id") is not None}
    satz_refs = [
        {"node_type": "satz", "id": node["id"]}
        for node in graph_nodes
        if node.get("node_type") == "satz"
        and node.get("id") is not None
        and _node_has_parent(node, "absatz", absatz_ids)
    ]
    saetze = await _batch_get_examination_nodes(project_id, satz_refs)

    return ExaminationRechtsmethodikContext(
        gesetze=gesetze,
        norms=existing_norms,
        absaetze=absaetze,
        saetze=saetze,
    )


async def fetch_project_norms(project_id: UUID) -> list[NormRef]:
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

    norms_by_key: dict[tuple[str, str], NormRef] = {}
    for tn in topic_norms:
        topic_id = tn.get("topic_id")
        subtopic_id = tn.get("subtopic_id")
        is_topic_norm = topic_id is not None and str(topic_id) in topic_scope.topic_ids
        is_subtopic_norm = subtopic_id is not None and str(subtopic_id) in topic_scope.subtopic_ids
        if not is_topic_norm and not is_subtopic_norm:
            continue
        jurabk = tn.get("jurabk")
        paragraph_nr = tn.get("paragraph_nr")
        if not jurabk or not paragraph_nr:
            continue
        owner_node_type = "topic" if is_topic_norm else "subtopic"
        owner_node_id = str(topic_id if is_topic_norm else subtopic_id)
        key = topic_norm_key(jurabk, paragraph_nr)
        norm = norms_by_key.setdefault(
            key,
            NormRef(jurabk=jurabk, paragraph_nr=paragraph_nr),
        )
        norm.topic_norms.append(
            TopicNormRef(
                owner_node_type=owner_node_type,
                owner_node_id=owner_node_id,
                topic_norm_id=str(tn["id"]),
            )
        )

    return list(norms_by_key.values())


async def _load_cached_norm_result(norm: NormRef) -> RechtsmethodikWorkflowOutput | None:
    """Fetch and validate the cached deconstruction for a norm, or None if unavailable."""
    jurabk = normalize_norm_value(norm.jurabk)
    paragraph = normalize_paragraph_nr(norm.paragraph_nr)
    rows = await ExaminationServiceClient.get_norm_deconstructions(
        jurabk=jurabk,
        paragraph=paragraph,
    )
    if not rows and (jurabk != norm.jurabk or paragraph != norm.paragraph_nr):
        rows = await ExaminationServiceClient.get_norm_deconstructions(
            jurabk=norm.jurabk,
            paragraph=norm.paragraph_nr,
        )
    if not rows:
        return None
    try:
        return RechtsmethodikWorkflowOutput.model_validate(rows[0]["deconstruction"])
    except (KeyError, ValidationError):
        return None


async def _resolve_topic_norms(
    project_id: UUID,
    norm: NormRef,
    norm_result: RechtsmethodikWorkflowOutput,
) -> list[dict[str, Any]]:
    """Build the topic_norms payload for a norm, falling back to the PLS topic graph."""
    if norm.topic_norms:
        return [
            {
                "id": topic_norm.topic_norm_id,
                "node_type": "topic_norm",
                "topic_id": topic_norm.owner_node_id if topic_norm.owner_node_type == "topic" else None,
                "subtopic_id": topic_norm.owner_node_id if topic_norm.owner_node_type == "subtopic" else None,
                "jurabk": norm_result.jurabk,
                "paragraph_nr": norm_result.paragraph_nr,
            }
            for topic_norm in norm.topic_norms
        ]
    return await _fetch_pls_topic_norms(project_id)


def _merge_inserts_and_updates(
    inserts: list[dict[str, Any]],
    updates: list[dict[str, Any]],
    all_inserts: list[dict[str, Any]],
    all_inserts_by_key: dict[tuple[str, str], dict[str, Any]],
    all_updates_by_key: dict[tuple[str, str], dict[str, Any]],
) -> None:
    """Accumulate a norm's inserts/updates into the batch-wide collections."""
    for insert in inserts:
        key = (insert["node_type"], str(insert["id"]))
        all_inserts.append(insert)
        all_inserts_by_key[key] = insert
    for update in updates:
        key = (update["node_type"], str(update["id"]))
        pending_insert = all_inserts_by_key.get(key)
        if pending_insert is not None:
            pending_insert["payload"].update(update["payload"])
            continue
        existing_update = all_updates_by_key.get(key)
        if existing_update is None:
            all_updates_by_key[key] = update
        else:
            existing_update["payload"].update(update["payload"])


def _apply_to_node_maps(
    inserts: list[dict[str, Any]],
    updates: list[dict[str, Any]],
    nodes_by_type: dict[str, list[dict[str, Any]]],
    nodes_by_id: dict[tuple[str, str], dict[str, Any]],
) -> None:
    """Apply a norm's inserts/updates to the in-memory node maps."""
    for insert in inserts:
        nodes = nodes_by_type.get(insert["node_type"])
        if nodes is not None:
            node = {"id": insert["id"], "node_type": insert["node_type"], **insert["payload"]}
            nodes.append(node)
            nodes_by_id[(insert["node_type"], str(insert["id"]))] = node

    for update in updates:
        node = nodes_by_id.get((update["node_type"], str(update["id"])))
        if node is not None:
            node.update(update["payload"])


async def _process_cached_norm_batch(project_id: UUID, norms: list[NormRef]) -> CachedNormDeconstructionBatchOutput:
    if not norms:
        return CachedNormDeconstructionBatchOutput(results=[], uncached_norms=[])

    results: list[MVPWorkflowOutput] = []
    uncached_norms: list[NormRef] = []
    context = await _fetch_examination_context_for_norms(project_id, norms)
    nodes_by_type: dict[str, list[dict[str, Any]]] = {
        "gesetz": context.gesetze,
        "norm": context.norms,
        "absatz": context.absaetze,
        "satz": context.saetze,
    }
    nodes_by_id = {
        (node_type, str(node["id"])): node
        for node_type, nodes in nodes_by_type.items()
        for node in nodes
        if node.get("id") is not None
    }
    all_inserts: list[dict[str, Any]] = []
    all_inserts_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    all_updates_by_key: dict[tuple[str, str], dict[str, Any]] = {}

    for norm in norms:
        norm_result = await _load_cached_norm_result(norm)
        if norm_result is None:
            uncached_norms.append(norm)
            continue

        topic_norms = await _resolve_topic_norms(project_id, norm, norm_result)

        inserts, updates, gesetz_id, norm_id = _build_inserts_and_updates(
            project_id=project_id,
            norm_result=norm_result,
            context=context,
            topic_norms=topic_norms,
        )
        _merge_inserts_and_updates(inserts, updates, all_inserts, all_inserts_by_key, all_updates_by_key)
        _apply_to_node_maps(inserts, updates, nodes_by_type, nodes_by_id)

        results.append(
            MVPWorkflowOutput(
                project_id=project_id,
                jurabk=norm_result.jurabk,
                paragraph_nr=norm_result.paragraph_nr,
                skipped=not inserts and not updates,
                gesetz_id=gesetz_id,
                norm_id=norm_id,
            )
        )

    all_updates = list(all_updates_by_key.values())
    if all_inserts or all_updates:
        await ExaminationServiceClient.update_nodes(project_id, inserts=all_inserts, updates=all_updates)

    return CachedNormDeconstructionBatchOutput(results=results, uncached_norms=uncached_norms)


async def process_cached_norm_deconstructions(
    project_id: UUID,
    norms: list[NormRef],
) -> CachedNormDeconstructionBatchOutput:
    results: list[MVPWorkflowOutput] = []
    uncached_norms: list[NormRef] = []

    for offset in range(0, len(norms), NODE_FETCH_BATCH_SIZE):
        batch_output = await _process_cached_norm_batch(
            project_id,
            norms[offset : offset + NODE_FETCH_BATCH_SIZE],
        )
        results.extend(batch_output.results)
        uncached_norms.extend(batch_output.uncached_norms)

    return CachedNormDeconstructionBatchOutput(results=results, uncached_norms=uncached_norms)
