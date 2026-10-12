"""Temporal activities used by the plausibility workflows."""

from src.activities.candidates import detect_candidates
from src.activities.clustering import build_clusters
from src.activities.context_checker import build_chunk_contexts_batch
from src.activities.dms_activities import (
    aggregate_and_upload_checkpoints,
    fetch_erlauterungsbericht_document_ids,
    fetch_project_metadata,
    upload_temporal_checkpoint,
)
from src.activities.notes import build_notes
from src.activities.prefilter import fetch_page_contexts_batch
from src.activities.qdrant_activities import (
    delete_document_from_qdrant,
    fetch_and_prepare_chunks,
    get_claim_ids,
    init_qdrant_collection,
    upload_claims_to_qdrant,
)
from src.activities.risk_screener import (
    build_screening_bundles_for_document,
    check_overflow_pairs,
    fetch_screening_payloads_batch,
)

# LLM and embedding calls run as shared activities on the central llm-client workers.
activities = [
    upload_temporal_checkpoint,
    aggregate_and_upload_checkpoints,
    build_screening_bundles_for_document,
    fetch_screening_payloads_batch,
    build_clusters,
    build_chunk_contexts_batch,
    build_notes,
    check_overflow_pairs,
    detect_candidates,
    fetch_page_contexts_batch,
    fetch_project_metadata,
    fetch_erlauterungsbericht_document_ids,
    get_claim_ids,
    init_qdrant_collection,
    delete_document_from_qdrant,
    fetch_and_prepare_chunks,
    upload_claims_to_qdrant,
]
