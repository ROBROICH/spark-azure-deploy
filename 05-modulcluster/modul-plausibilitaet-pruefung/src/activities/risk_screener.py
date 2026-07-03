"""Non-LLM Temporal activities for the risk-screening stage.

The LLM screening itself is performed in workflow code via
``temporal.activities.llm.llm_invoke_structured``.
"""

from temporalio import activity

from src.config.config import config
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleRequest,
    DocumentBundleResult,
    FetchScreeningPayloadsBatchInput,
    ResolvedClaimData,
    ScreeningCandidateBundle,
)
from src.workflows.clients import qdrant_client


@activity.defn
async def build_screening_bundles_for_document(
    request: DocumentBundleRequest,
) -> DocumentBundleResult:
    """Build screening bundles for all claims in a document using batched Qdrant queries.

    Fetches all claim vectors and chunk payloads in bulk, then issues all KNN queries
    in configurable-size batches. Returns raw bundles (one per claim) without
    deduplication — symmetric-pair deduplication is the caller's responsibility.
    """
    if not request.claim_ids:
        return DocumentBundleResult(bundles=[])

    k_overfetch = (
        config.RISK_SCREENING.K_ERLAEUTERUNGSBERICHT_COMPARISON_CLAIMS + config.RISK_SCREENING.K_LOCAL_COMPARISON_CLAIMS
    )

    # Bulk-fetch all claim payloads with vectors.
    claim_payloads = await qdrant_client.get_claim_payloads(
        project_id=request.project_id,
        claim_ids=request.claim_ids,
        with_vectors=True,
    )
    # Preserve the caller's ordering.
    claim_payload_by_id = {p.claim_id: p for p in claim_payloads}
    ordered_claim_payloads = [claim_payload_by_id[cid] for cid in request.claim_ids if cid in claim_payload_by_id]

    # Bulk-fetch all chunk payloads needed for local-exclusion filters.
    unique_chunk_ids = list({p.chunk_id for p in ordered_claim_payloads if p.chunk_id})
    chunk_payloads_list = await qdrant_client.get_chunk_payloads(
        project_id=request.project_id,
        chunk_ids=unique_chunk_ids,
    )
    chunk_payloads_by_id = {cp.chunk_id: cp for cp in chunk_payloads_list}

    # The 3-query spec is identical for every claim; only the vector and filters differ.
    queries_per_claim = [
        {
            "k_neighbors": config.RISK_SCREENING.K_ERLAEUTERUNGSBERICHT_COMPARISON_CLAIMS,
            "exclude_local_claims": True,
            "same_doc_claims_only": False,
            "erlaeuterungsbericht_claims_only": True,
        },
        {
            "k_neighbors": config.RISK_SCREENING.K_LOCAL_COMPARISON_CLAIMS,
            "same_doc_claims_only": True,
            "exclude_local_claims": False,
        },
        {
            "k_neighbors": config.RISK_SCREENING.K_TOTAL_COMPARISON_CLAIMS + k_overfetch,
            "same_doc_claims_only": False,
            "exclude_local_claims": True,
        },
    ]

    # Issue all (claim × query) combinations in batches.
    all_results = await qdrant_client.get_claim_knn_ids_all_claims_batched(
        project_id=request.project_id,
        claim_payloads=ordered_claim_payloads,
        chunk_payloads_by_id=chunk_payloads_by_id,
        queries_per_claim=queries_per_claim,
        batch_size=config.RISK_SCREENING.QDRANT_QUERY_BATCH_SIZE,
        score_lower_threshold=config.RISK_SCREENING.SCORE_LOWER_THRESHOLD,
        score_upper_threshold=config.RISK_SCREENING.SCORE_UPPER_THRESHOLD,
    )

    bundles: list[ScreeningCandidateBundle] = []
    for claim_payload, (erlaeuterungsbericht_refs, same_doc_refs_local_allowed, same_doc_refs_no_local_raw) in zip(
        ordered_claim_payloads, all_results, strict=False
    ):
        q1_q2_ids = set(erlaeuterungsbericht_refs + same_doc_refs_local_allowed)
        same_doc_refs_no_local = [ref_id for ref_id in same_doc_refs_no_local_raw if ref_id not in q1_q2_ids]

        k_erlaeuterungsbericht_found = len(erlaeuterungsbericht_refs)
        k_local_found = len(same_doc_refs_local_allowed)
        k_remaining = max(
            0,
            config.RISK_SCREENING.K_TOTAL_COMPARISON_CLAIMS - k_erlaeuterungsbericht_found - k_local_found,
        )

        candidate_reference_claim_ids = (erlaeuterungsbericht_refs + same_doc_refs_local_allowed)[
            : config.RISK_SCREENING.K_TOTAL_COMPARISON_CLAIMS
        ]
        candidate_reference_claim_ids += same_doc_refs_no_local[:k_remaining]
        candidate_reference_claim_ids = candidate_reference_claim_ids[: config.RISK_SCREENING.K_TOTAL_COMPARISON_CLAIMS]

        bundles.append(
            ScreeningCandidateBundle(
                project_id=request.project_id,
                document_id=request.document_id,
                chunk_id=claim_payload.chunk_id,
                claim_id=claim_payload.claim_id,
                reference_claims=candidate_reference_claim_ids,
            )
        )

    return DocumentBundleResult(bundles=bundles)


@activity.defn
async def fetch_screening_payloads_batch(
    request: FetchScreeningPayloadsBatchInput,
) -> dict[str, ResolvedClaimData]:
    """Fetch all claim payloads needed for screening a batch of grouped bundles from Qdrant.

    Collects unique claim IDs across all bundles and performs a single bulk fetch.
    Returns minimal claim data (text + chunk ID) — no LLM call involved.
    """
    all_claim_ids: set[str] = set()
    for bundle_group in request.bundles:
        for bundle in bundle_group.bundles:
            all_claim_ids.add(bundle.claim_id)
            all_claim_ids.update(bundle.reference_claims)

    payloads = await qdrant_client.get_claim_payloads(
        project_id=request.project_id,
        claim_ids=list(all_claim_ids),
        with_vectors=False,
    )
    return {
        p.claim_id: ResolvedClaimData(
            claim_id=p.claim_id,
            chunk_id=p.chunk_id,
            claim_text=p.claim_text,
        )
        for p in payloads
    }
