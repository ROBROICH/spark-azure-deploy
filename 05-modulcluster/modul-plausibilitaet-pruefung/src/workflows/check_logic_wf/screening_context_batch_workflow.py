"""Child workflow that processes a batch of screening bundles and returns context-check results.

LLM calls run as shared ``llm_invoke_structured`` activities — invoked here directly from
the workflow so the task queue is auto-resolved from the configured model.
"""

from datetime import timedelta

from prompt_injection.prompt_defense import sanitize_and_wrap_external_data, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporal.activities.models import ChatModel
from temporal.utils import sliding_window
from temporalio import workflow

from src.activities.context_checker import build_chunk_contexts_batch
from src.activities.dms_activities import ProjectMetadataResult, fetch_project_metadata
from src.activities.risk_screener import fetch_screening_payloads_batch
from src.config.config import config
from src.config.env import ENV
from src.workflows.check_logic_wf.prompts.context_checker_prompts import (
    COMBINED_CHECKER_VERIFIER_SYSTEM_PROMPT,
)
from src.workflows.check_logic_wf.prompts.risk_screener_prompts import (
    GROUPED_RISK_SCREENER_SYSTEM_PROMPT,
)
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    BuildChunkContextsInput,
    ChunkWithContext,
    ConflictCheckerLLMOutput,
    ContextCheckerInput,
    ContextCheckerLLMInput,
    ContextCheckerOutput,
    ContextCheckVerdict,
)
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    FetchScreeningPayloadsBatchInput,
    GroupedRiskScreenerPromptCheckClaim,
    GroupedRiskScreenerPromptPayload,
    GroupedRiskScreenerResponse,
    GroupedScreeningBundle,
    ResolvedGroupedScreeningBundle,
    RiskScreenerReferencePromptItem,
    ScreeningHit,
)
from src.workflows.check_logic_wf.schemas.screening_batch_schemas import (
    ScreeningBatchInput,
    ScreeningBatchOutput,
)


async def _screen_grouped_bundle(
    resolved_bundle: ResolvedGroupedScreeningBundle,
    model: ChatModel,
) -> list[ScreeningHit]:
    """Screen multiple claims from the same chunk in one LLM call.

    Uses pre-fetched claim data (no Qdrant call) and issues one LLM call.
    """
    payload_by_id = resolved_bundle.claim_payloads

    # 1. Build global reference pool with stable 1-based indices
    all_ref_ids: list[str] = []
    seen_ref_ids: set[str] = set()
    for bundle in resolved_bundle.bundles:
        for ref_id in bundle.reference_claims:
            if ref_id not in seen_ref_ids and ref_id in payload_by_id:
                all_ref_ids.append(ref_id)
                seen_ref_ids.add(ref_id)

    ref_uuid_to_idx = {uuid: idx for idx, uuid in enumerate(all_ref_ids, start=1)}
    ref_idx_to_uuid = {idx: uuid for uuid, idx in ref_uuid_to_idx.items()}

    # 2. Build check claims with their assigned reference indices
    check_idx_to_uuid: dict[int, str] = {}
    check_claims: list[GroupedRiskScreenerPromptCheckClaim] = []
    next_check_idx = 0
    for bundle in resolved_bundle.bundles:
        if bundle.claim_id not in payload_by_id:
            continue
        ref_indices = [ref_uuid_to_idx[rid] for rid in bundle.reference_claims if rid in ref_uuid_to_idx]
        if not ref_indices:
            continue
        next_check_idx += 1
        check_idx_to_uuid[next_check_idx] = bundle.claim_id
        check_claims.append(
            GroupedRiskScreenerPromptCheckClaim(
                check_id=next_check_idx,
                claim_text=payload_by_id[bundle.claim_id].claim_text,
                reference_ids=ref_indices,
            )
        )

    reference_claims = [
        RiskScreenerReferencePromptItem(
            reference_id=idx,
            claim_text=payload_by_id[ref_idx_to_uuid[idx]].claim_text,
        )
        for idx in sorted(ref_idx_to_uuid.keys())
    ]

    if not check_claims:
        return []

    # 3. Single LLM call
    prompt_payload = GroupedRiskScreenerPromptPayload(
        check_claims=check_claims,
        reference_claims=reference_claims,
    )
    response = await llm_invoke_structured(
        prompt=sanitize_and_wrap_external_data(prompt_payload.model_dump_json(indent=2)),
        system_prompt=wrap_system_prompt(GROUPED_RISK_SCREENER_SYSTEM_PROMPT, lang="de"),
        output_class=GroupedRiskScreenerResponse,
        model=model,
        temperature=0.0,
        top_p=1.0,
        reasoning_effort="medium",
        retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
    )

    # 4. Translate indices back to UUIDs and filter by threshold
    hits: list[ScreeningHit] = []
    for item in response.results:
        if item.rating < config.RISK_SCREENING.RATING_THRESHOLD:
            continue
        check_uuid = check_idx_to_uuid.get(item.check_id)
        ref_uuid = ref_idx_to_uuid.get(item.reference_id)
        if not check_uuid or not ref_uuid:
            continue
        check_payload = payload_by_id.get(check_uuid)
        ref_payload = payload_by_id.get(ref_uuid)
        if not check_payload or not ref_payload:
            continue
        hits.append(
            ScreeningHit(
                claim_id=check_uuid,
                reference_id=ref_uuid,
                claim_chunk_id=check_payload.chunk_id,
                reference_chunk_id=ref_payload.chunk_id,
                rating=item.rating,
                note=item.note,
                reasoning=item.reasoning,
            )
        )

    return hits


async def _check_conflict(
    request: ContextCheckerInput,
    chunk_a_context: ChunkWithContext,
    chunk_b_context: ChunkWithContext,
    project_meta_result: ProjectMetadataResult,
    chunk_a_id: str,
    chunk_b_id: str,
    model: ChatModel,
) -> ContextCheckerOutput:
    """Evaluate one screened claim pair with integrated self-audit in a single LLM call."""
    context_checker_input = ContextCheckerLLMInput(
        project_base_md=project_meta_result.metadata,
        project_base_md_status=project_meta_result.status,
        chunk_a=chunk_a_context,
        chunk_b=chunk_b_context,
        screening_note=request.screening_note,
    )

    result = await llm_invoke_structured(
        prompt=sanitize_and_wrap_external_data(context_checker_input.model_dump_json(indent=2)),
        system_prompt=wrap_system_prompt(COMBINED_CHECKER_VERIFIER_SYSTEM_PROMPT, lang="de"),
        output_class=ConflictCheckerLLMOutput,
        model=model,
        temperature=0.0,
        top_p=1.0,
        reasoning_effort="medium",
        retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
    )

    verdict = ContextCheckVerdict(
        rating=result.rating,
        title=result.title,
        explanation=result.explanation,
        chunk_a_excerpt=result.chunk_a_excerpt,
        chunk_b_excerpt=result.chunk_b_excerpt,
    )

    return ContextCheckerOutput(
        chunk_a_id=chunk_a_id,
        chunk_b_id=chunk_b_id,
        claim_a_id=request.claim_id,
        claim_b_id=request.reference_claim_id,
        chunk_a_context=chunk_a_context,
        chunk_b_context=chunk_b_context,
        verdict=verdict,
        is_inconsistency=verdict.rating >= config.CONTEXT_CHECKING.RATING_THRESHOLD,
        audit_explanation=result.audit_explanation,
        screening_note=request.screening_note,
    )


async def _build_contexts_for_hits(
    project_id: str,
    hits: list[ScreeningHit],
) -> tuple[dict[str, str], dict[str, ChunkWithContext]]:
    """Build chunk contexts for a list of hits.

    Uses claim→chunk mappings already resolved during screening (carried on
    ScreeningHit) so no extra Qdrant round-trip is needed.

    Splits large ID sets into sub-batches to keep per-activity memory bounded
    (each batch fetches base chunks + up to 11 neighbours per chunk).
    """
    batch_size = config.CONTEXT_CHECKING.CONTEXT_BATCH_SIZE

    # 1. Build claim_id → chunk_id from the hits (already resolved during screening)
    claim_to_chunk: dict[str, str] = {}
    for hit in hits:
        claim_to_chunk[hit.claim_id] = hit.claim_chunk_id
        claim_to_chunk[hit.reference_id] = hit.reference_chunk_id

    # 2. Batch-build contexts in sub-batches to limit worker memory
    unique_chunk_ids = list(set(claim_to_chunk.values()))
    chunk_contexts: dict[str, ChunkWithContext] = {}

    for i in range(0, len(unique_chunk_ids), batch_size):
        batch_ids = unique_chunk_ids[i : i + batch_size]
        raw_batch: dict[str, ChunkWithContext] = await workflow.execute_activity(
            build_chunk_contexts_batch,
            arg=BuildChunkContextsInput(project_id=project_id, chunk_ids=batch_ids),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )
        for k, v in raw_batch.items():
            chunk_contexts[k] = ChunkWithContext.model_validate(v)

    return claim_to_chunk, chunk_contexts


@workflow.defn
class PlausibilityScreeningContextBatchWorkflow:
    """Screens a batch of grouped bundles and runs context checks on all hits."""

    @workflow.run
    async def run(self, inp: ScreeningBatchInput) -> ScreeningBatchOutput:
        model: ChatModel = ENV.LITELLM.MODEL

        # 1. Fetch all claim payloads for screening (Qdrant, non-LLM activity)
        raw_payloads = await workflow.execute_activity(
            fetch_screening_payloads_batch,
            FetchScreeningPayloadsBatchInput(
                project_id=inp.project_id,
                bundles=inp.bundles,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )

        # 2. Fan out LLM screening with pre-fetched payloads.
        def _resolve(grouped_bundle: GroupedScreeningBundle) -> ResolvedGroupedScreeningBundle:
            needed_ids: set[str] = set()
            for b in grouped_bundle.bundles:
                needed_ids.add(b.claim_id)
                needed_ids.update(b.reference_claims)
            return ResolvedGroupedScreeningBundle(
                project_id=grouped_bundle.project_id,
                document_id=grouped_bundle.document_id,
                bundles=grouped_bundle.bundles,
                claim_payloads={cid: raw_payloads[cid] for cid in needed_ids if cid in raw_payloads},
            )

        screening_results = await sliding_window(
            inp.bundles,
            lambda grouped_bundle: _screen_grouped_bundle(_resolve(grouped_bundle), model),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )

        all_hits = [hit for hits in screening_results for hit in hits]

        if not all_hits:
            return ScreeningBatchOutput(context_check_outputs=[])

        # 3. Fetch chunk contexts and project metadata (non-LLM activities)
        claim_to_chunk, chunk_contexts = await _build_contexts_for_hits(inp.project_id, all_hits)

        raw_meta = await workflow.execute_activity(
            fetch_project_metadata,
            inp.project_id,
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )
        project_meta_result = ProjectMetadataResult.model_validate(raw_meta)

        # 4. Filter out hits with missing chunk contexts — retrying would hit
        #    the same missing data and end in a non-retryable error anyway.
        ready_hits: list[ScreeningHit] = []
        for hit in all_hits:
            chunk_a = claim_to_chunk.get(hit.claim_id)
            chunk_b = claim_to_chunk.get(hit.reference_id)
            if not chunk_a or chunk_a not in chunk_contexts:
                workflow.logger.warning(
                    "Skipping hit: missing chunk context for claim_id %s (chunk_id=%s)",
                    hit.claim_id,
                    chunk_a,
                )
                continue
            if not chunk_b or chunk_b not in chunk_contexts:
                workflow.logger.warning(
                    "Skipping hit: missing chunk context for reference_id %s (chunk_id=%s)",
                    hit.reference_id,
                    chunk_b,
                )
                continue
            ready_hits.append(hit)

        if not ready_hits:
            return ScreeningBatchOutput(context_check_outputs=[])

        # 5. Fan out context checks with all pre-fetched data (pure LLM activity)
        context_check_outputs: list[ContextCheckerOutput] = await sliding_window(
            ready_hits,
            lambda hit: _check_conflict(
                request=ContextCheckerInput(
                    project_id=inp.project_id,
                    document_id=inp.document_id,
                    claim_id=hit.claim_id,
                    reference_claim_id=hit.reference_id,
                    screening_note=hit.note,
                ),
                chunk_a_context=chunk_contexts[claim_to_chunk[hit.claim_id]],
                chunk_b_context=chunk_contexts[claim_to_chunk[hit.reference_id]],
                project_meta_result=project_meta_result,
                chunk_a_id=claim_to_chunk[hit.claim_id],
                chunk_b_id=claim_to_chunk[hit.reference_id],
                model=model,
            ),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )

        return ScreeningBatchOutput(context_check_outputs=context_check_outputs)
