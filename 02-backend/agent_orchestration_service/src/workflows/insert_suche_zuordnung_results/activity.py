from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from temporalio import activity

from src.services.api_clients import ExaminationServiceClient
from src.workflows.insert_suche_zuordnung_results.types import (
    InsertSucheZuordnungResultsOutput,
)
from src.workflows.result_insertion import delete_stale_fundstellen_for_inserts, insert_nodes_idempotent


class ResolveChunkDokumenteInput(BaseModel):
    project_id: UUID
    chunk_ids: list[str]


class WriteSatzFundstellenInput(BaseModel):
    project_id: UUID
    inserts: list[dict[str, Any]] = Field(default_factory=list)


@activity.defn(name="fetch_existing_dokumente_for_suz")
async def _fetch_existing_dokumente_for_suz(project_id: UUID) -> dict[str, str]:
    """Fetch existing Dokument nodes and return a mapping of dms_file_id → node UUID."""
    graph = await ExaminationServiceClient.list_nodes(project_id)
    nodes = graph.get("nodes", [])
    dokument_refs = [n for n in nodes if n.get("node_type") == "dokument"]

    if not dokument_refs:
        return {}

    batch_result = await ExaminationServiceClient.batch_get_nodes(
        project_id,
        [{"node_type": "dokument", "id": n["id"]} for n in dokument_refs],
    )

    dms_to_dokument: dict[str, str] = {}
    for doc in batch_result.get("results", []):
        dms_file_id = doc.get("dms_file_id")
        doc_id = doc.get("id")
        if dms_file_id and doc_id:
            dms_to_dokument[str(dms_file_id)] = str(doc_id)

    return dms_to_dokument


@activity.defn(name="resolve_chunk_dokumente")
async def _resolve_chunk_dokumente(args: ResolveChunkDokumenteInput) -> dict[str, str]:
    """Batch-resolve chunk node UUID → dokument node UUID for the given chunk_ids."""
    if not args.chunk_ids:
        return {}

    batch_result = await ExaminationServiceClient.batch_get_nodes(
        args.project_id,
        [{"node_type": "chunk", "id": cid} for cid in args.chunk_ids],
    )

    chunk_to_dokument: dict[str, str] = {}
    for node in batch_result.get("results", []):
        cid = node.get("id")
        did = node.get("dokument_id")
        if cid and did:
            chunk_to_dokument[str(cid)] = str(did)

    return chunk_to_dokument


@activity.defn(name="write_satz_fundstellen")
async def _write_satz_fundstellen(
    args: WriteSatzFundstellenInput,
) -> InsertSucheZuordnungResultsOutput:
    if not args.inserts:
        return InsertSucheZuordnungResultsOutput(skipped=True)

    await delete_stale_fundstellen_for_inserts(args.project_id, args.inserts)
    await insert_nodes_idempotent(args.project_id, args.inserts)
    return InsertSucheZuordnungResultsOutput(
        fundstellen_inserted=len(args.inserts),
        skipped=False,
        inserts=args.inserts,
    )
