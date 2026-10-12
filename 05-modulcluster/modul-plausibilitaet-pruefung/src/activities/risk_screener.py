"""Non-LLM Temporal activities for the risk-screening stage; the LLM calls live in workflow code."""

from temporalio import activity

from src.activities import candidates
from src.config.config import config
from src.qdrant.schemas import ChunkPayload, ClaimPayload
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleRequest,
    DocumentBundleResult,
    FetchScreeningPayloadsBatchInput,
    OverflowCheckInput,
    ResolvedClaimData,
    ScreeningCandidateBundle,
    ScreeningHit,
)
from src.workflows.clients import qdrant_client


@activity.defn
async def build_screening_bundles_for_document(
    request: DocumentBundleRequest,
) -> DocumentBundleResult:
    """One screening bundle per claim of a document; symmetric pairs are deduplicated by the caller."""
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
    # Superseded editions are references only, never check claims.
    n_before = len(ordered_claim_payloads)
    ordered_claim_payloads = [p for p in ordered_claim_payloads if not p.superseded]
    if len(ordered_claim_payloads) != n_before:
        activity.logger.info(
            "Skipping %d superseded claims as check claims for document %s",
            n_before - len(ordered_claim_payloads),
            request.document_id,
        )
    if not ordered_claim_payloads:
        return DocumentBundleResult(bundles=[])

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

    # Neighbours above the upper window are kept for the copied-sentence test.
    full_results = await qdrant_client.get_claim_knn_batched(
        project_id=request.project_id,
        claim_payloads=ordered_claim_payloads,
        chunk_payloads_by_id=chunk_payloads_by_id,
        queries_per_claim=queries_per_claim,
        batch_size=config.RISK_SCREENING.QDRANT_QUERY_BATCH_SIZE,
        score_lower_threshold=config.RISK_SCREENING.SCORE_LOWER_THRESHOLD,
        score_upper_threshold=config.RISK_SCREENING.SCORE_UPPER_THRESHOLD,
    )
    all_results = [[inside for inside, _ in per_claim] for per_claim in full_results]
    overflow_pairs: list[tuple[str, str]] = []
    seen_overflow: set[frozenset[str]] = set()
    for claim_payload, per_claim in zip(ordered_claim_payloads, full_results, strict=False):
        for _, overflow in per_claim:
            for ref in overflow:
                key = frozenset((claim_payload.claim_id, ref))
                if key not in seen_overflow:
                    seen_overflow.add(key)
                    overflow_pairs.append((claim_payload.claim_id, ref))

    cross_reference_refs = await _cross_references(request.project_id, ordered_claim_payloads, chunk_payloads_by_id)

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
        # Cross-reference targets come on top of the budget.
        for ref in cross_reference_refs.get(claim_payload.claim_id, []):
            if ref not in candidate_reference_claim_ids:
                candidate_reference_claim_ids.append(ref)

        bundles.append(
            ScreeningCandidateBundle(
                project_id=request.project_id,
                document_id=request.document_id,
                chunk_id=claim_payload.chunk_id,
                claim_id=claim_payload.claim_id,
                reference_claims=candidate_reference_claim_ids,
            )
        )

    return DocumentBundleResult(
        bundles=bundles, overflow_pairs=overflow_pairs, verweis_bundles=len(cross_reference_refs)
    )


async def _cross_references(
    project_id: str,
    claim_payloads: list[ClaimPayload],
    chunk_payloads_by_id: dict[str, ChunkPayload],
) -> dict[str, list[str]]:
    """Reference claims inside the documents a claim's sentence points to."""
    p = config.CANDIDATES
    if not claim_payloads:
        return {}
    # Which claims carry a cross-reference? Look at the claim's quotes (falls back to the claim text).
    citing: list[tuple[ClaimPayload, candidates.CrossReference]] = []
    for c in claim_payloads:
        text = " ".join([*c.evidence_sentences, c.claim_text])
        cross_references = candidates.find_cross_references(text)
        if cross_references:
            citing.append((c, cross_references[0]))
    if not citing:
        return {}
    titles = await qdrant_client.list_document_titles(project_id)
    targets: list[tuple[ClaimPayload, list[str]]] = []
    for c, v in citing:
        docs = candidates.target_document_ids(v, c.document_id, titles)
        if docs:
            targets.append((c, docs[:5]))
    if not targets:
        return {}
    # One restricted, window-free query per citing claim (queries differ per claim -> one call each).
    out: dict[str, list[str]] = {}
    for c, docs in targets:
        res = await qdrant_client.get_claim_knn_batched(
            project_id=project_id,
            claim_payloads=[c],
            chunk_payloads_by_id=chunk_payloads_by_id,
            queries_per_claim=[
                {
                    "k_neighbors": p.CROSS_REFERENCE_K,
                    "same_doc_claims_only": False,
                    "exclude_local_claims": False,
                    "document_ids": docs,
                    "score_lower": p.CROSS_REFERENCE_SCORE_LOWER,
                    "score_upper": None,
                }
            ],
            batch_size=1,
        )
        inside, overflow = res[0][0]
        refs = inside + overflow
        if refs:
            out[c.claim_id] = refs
    return out


@activity.defn
async def check_overflow_pairs(inp: OverflowCheckInput) -> list[ScreeningHit]:
    """Copied-sentence test on neighbours above the cosine window (0 LLM calls)."""
    if not inp.pairs:
        return []
    ids = list({cid for pair in inp.pairs for cid in pair})
    payloads = {c.claim_id: c for c in await qdrant_client.get_claim_payloads(project_id=inp.project_id, claim_ids=ids)}
    resolved = [(payloads[a], payloads[b]) for a, b in inp.pairs if a in payloads and b in payloads]
    hits = candidates.hits_from_overflow(resolved)
    activity.logger.info("Overflow test: %d pairs checked, %d candidates", len(resolved), len(hits))
    return hits


@activity.defn
async def fetch_screening_payloads_batch(
    request: FetchScreeningPayloadsBatchInput,
) -> dict[str, ResolvedClaimData]:
    """Text and chunk id of every claim in a batch of grouped bundles, in one bulk fetch."""
    all_claim_ids: set[str] = set(request.extra_claim_ids)
    for bundle_group in request.bundles:
        for bundle in bundle_group.bundles:
            all_claim_ids.add(bundle.claim_id)
            all_claim_ids.update(bundle.reference_claims)
    if not all_claim_ids:
        return {}

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
            instance_identifiers=p.instance_identifiers,
        )
        for p in payloads
    }
