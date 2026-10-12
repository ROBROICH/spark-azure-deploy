"""Temporal activities for Qdrant database operations."""

from qdrant_client.models import PointStruct
from temporalio import activity

from src.activities.extraction_evidence import annotate_chunks
from src.activities.mojibake import is_mojibake
from src.config.config import Config, config
from src.qdrant.schemas import ChunkPayload
from src.workflows.clients import qdrant_client
from src.workflows.qdrant_wf.schemas.workflow import (
    DocumentActivityInput,
    UploadClaimsInput,
)


@activity.defn
async def init_qdrant_collection() -> None:
    """Initializes claim Qdrant collection for claims if it doesn't exist."""
    await qdrant_client.init_claim_collection()


@activity.defn
async def delete_document_from_qdrant(inp: DocumentActivityInput) -> None:
    """Deletes all entries for a specific document from the claims collection."""
    await qdrant_client.clear_document_claims(project_id=inp.project_id, document_id=inp.document_id)


@activity.defn
async def fetch_and_prepare_chunks(inp: DocumentActivityInput) -> list[ChunkPayload]:
    """Usable chunks of a document (no short, image or glyph-shifted chunks), annotated with identifiers."""
    chunk_ids = await qdrant_client.get_chunk_ids_by_document_id(project_id=inp.project_id, document_id=inp.document_id)

    chunk_payloads = await qdrant_client.get_chunk_payloads(project_id=inp.project_id, chunk_ids=chunk_ids)

    valid_chunks = [
        c
        for c in chunk_payloads
        if len(c.chunk_content) >= Config.QDRANT_BUILDER.CHUNK_MIN_LENGTH
        and c.chunk_type != "image"
        and not is_mojibake(c.chunk_content)  # glyph-shifted text yields no usable claim
    ]

    # Page-level identifiers come from the full chunk set: the distinguishing header lives outside the claim's chunk.
    return annotate_chunks(valid_chunks)


@activity.defn
async def upload_claims_to_qdrant(inp: UploadClaimsInput) -> None:
    """Upload claims to Qdrant; the workflow sets ``claim.vector`` beforehand."""
    if not inp.claims:
        return

    if any(c.vector is None for c in inp.claims):
        raise ValueError("upload_claims_to_qdrant requires every claim to have a non-None vector.")

    collection_name = Config.QDRANT.CLAIM_COLLECTION_NAME

    points = [
        PointStruct(
            id=c.claim_id,
            vector=c.vector,
            payload={
                "project_id": c.project_id,
                "document_id": c.document_id,
                "title": c.title,
                "chunk_id": c.chunk_id,
                "erlauterungsbericht": c.erlauterungsbericht,
                "instance_identifiers": c.instance_identifiers,
                "object_ids": c.object_ids,
                "objekt": c.objekt,
                "superseded": c.superseded,
                "claim_metadata": {
                    "claim_id": c.claim_id,
                    "claim_content": c.claim_text,
                    "evidence": c.claim_metadata.evidence,
                },
            },
        )
        for c in inp.claims
    ]

    batch_size = config.QDRANT_BUILDER.PROCESS_AND_UPLOAD_BATCH_SIZE
    for i in range(0, len(points), batch_size):
        await qdrant_client.upsert(collection_name=collection_name, points=points[i : i + batch_size], wait=True)

    activity.logger.info(f"Uploaded {len(inp.claims)} claims for doc {inp.claims[0].document_id} to Qdrant.")


@activity.defn
async def get_claim_ids(inp: DocumentActivityInput) -> list[str]:
    """Retrieves all claim IDs for a given document from Qdrant."""
    return await qdrant_client.get_claim_ids(inp.document_id, inp.project_id)
