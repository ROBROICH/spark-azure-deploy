"""Activity to fetch extraction data from the examination service for Qdrant re-indexing."""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

from temporal.workflows.inhaltsextraktion.types import ProcessedFileInfo
from temporalio import activity

from src.services.api_clients import ExaminationServiceClient
from src.workflows.insert_extraction_results.reverse_mapper import (
    reconstruct_processed_files,
)

_NEEDED_NODE_TYPES = frozenset(
    {
        "dokument",
        "chunk",
        "sub_chunk",
        "sub_chunk_text",
        "sub_chunk_table",
        "sub_chunk_image",
        "markdown_text",
        "sub_chunk_relation",
    }
)


@activity.defn(name="fetch_processed_documents_from_graph")
async def _fetch_processed_documents_from_graph(project_id: str) -> list[ProcessedFileInfo]:
    """Fetch all extraction data for a project from the examination service.

    Queries the graph, reconstructs ProcessedDocument objects, and returns
    them as ProcessedFileInfo — ready to be passed to QdrantBuilderWorkflow.
    """
    graph = await ExaminationServiceClient.list_nodes(UUID(project_id))
    all_node_refs = graph.get("nodes", [])

    if not all_node_refs:
        activity.logger.info("No nodes found in examination service for project %s", project_id)
        return []

    # Group refs by type and filter to only the types we need
    refs_by_type: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ref in all_node_refs:
        node_type = ref.get("node_type", "")
        if node_type in _NEEDED_NODE_TYPES:
            refs_by_type[node_type].append(ref)

    if "dokument" not in refs_by_type:
        activity.logger.info("No dokument nodes found for project %s", project_id)
        return []

    # Fetch full payloads for all needed nodes in a single batch
    all_refs = [{"node_type": ref["node_type"], "id": ref["id"]} for refs in refs_by_type.values() for ref in refs]

    batch_result = await ExaminationServiceClient.batch_get_nodes(UUID(project_id), all_refs)
    all_nodes = batch_result.get("results", [])

    activity.logger.info(
        "Fetched %d nodes from examination service for project %s (%d dokumente)",
        len(all_nodes),
        project_id,
        len(refs_by_type["dokument"]),
    )

    return reconstruct_processed_files(all_nodes, project_id)
