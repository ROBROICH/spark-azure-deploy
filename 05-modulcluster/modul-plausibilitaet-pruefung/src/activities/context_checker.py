from prompt_defense import sanitize_llm_input, wrap_system_prompt
from temporalio import activity
from temporalio.exceptions import ApplicationError

from src.config.config import config
from src.dms.schemas import BaseMetadata, ProjectBaseMetadataStatus
from src.qdrant.schemas import ChunkPayload, ClaimPayload
from src.workflows.check_logic_wf.prompts.context_checker_prompts import (
    CONFLICT_CHECKER_SYSTEM_PROMPT,
    CONFLICT_VERIFIER_SYSTEM_PROMPT,
)
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    ChunkWithContext,
    ContextCheckerInput,
    ContextCheckerLLMInput,
    ContextCheckerOutput,
    ContextCheckVerdict,
    VerificationInput,
    VerificationOutput,
)
from src.workflows.clients import dms_client, llm_client, qdrant_client


def _chunk_to_text(chunk: ChunkPayload) -> str:
    """
    Convert a ChunkPayload to text for downstream LLM prompts.

    - Text chunks: return verbatim chunk_content.
    - Non-text chunks: include the (LLM-generated) summary, wrapped in clear BEGIN/END markers
      so it's obvious where the non-verbatim section starts and ends.
    """
    if chunk.chunk_type == "text":
        sanitized = sanitize_llm_input({"content": chunk.chunk_content})
        return sanitized["content"].strip()

    summary = (chunk.summary or "").strip()
    if not summary:
        return ""

    sanitized = sanitize_llm_input({"summary": summary})
    return (
        f"{config.CONTEXT_CHECKING.LLM_SUMMARY_BEGIN_MARKER}\n"
        "WARNUNG: Der folgende Abschnitt ist eine LLM-generierte Zusammenfassung "
        "eines Nicht-Text-Inhalts (z.B. Bild/Tabelle). Er ist kein wörtliches Zitat "
        "und darf nicht als belastbarer Beleg für Aussagen oder Widersprüche verwendet werden.\n"
        "---\n"
        f"{sanitized['summary']}\n"
        f"{config.CONTEXT_CHECKING.LLM_SUMMARY_END_MARKER}"
    )


def _build_chunk_context(
    chunk_id: str,
    project_id: str,
) -> ChunkWithContext:
    """Build a section-aware context window around one chunk for LLM evaluation."""
    base_chunk_record, previous_chunk_records, following_chunk_records = qdrant_client.get_chunk_payload_with_neighbors(
        project_id=project_id,
        chunk_id=chunk_id,
        prev=config.CONTEXT_CHECKING.MAX_PREVIOUS_CHUNKS,
        n_next=config.CONTEXT_CHECKING.MAX_FOLLOWUP_CHUNKS,
    )

    base_chunk_payload = ChunkPayload.model_validate(base_chunk_record)
    preceding_chunk_payloads = (
        [ChunkPayload.model_validate(chunk) for chunk in previous_chunk_records] if previous_chunk_records else None
    )
    following_chunk_payloads = (
        [ChunkPayload.model_validate(chunk) for chunk in following_chunk_records] if following_chunk_records else None
    )

    # Keep only neighbors from the same TOC section as the base chunk.
    if preceding_chunk_payloads is not None:
        preceding_chunk_payloads = [
            chunk_payload
            for chunk_payload in preceding_chunk_payloads
            if chunk_payload.toc_path == base_chunk_payload.toc_path
        ]
    if following_chunk_payloads is not None:
        following_chunk_payloads = [
            chunk_payload
            for chunk_payload in following_chunk_payloads
            if chunk_payload.toc_path == base_chunk_payload.toc_path
        ]

    # Previous chunks arrive nearest-first; reverse to restore reading order.
    if preceding_chunk_payloads is not None:
        preceding_chunk_payloads = preceding_chunk_payloads[::-1]

    # Build context text; when preceding context is too long we keep a prefix and
    # suffix because chapter openings and immediate local context can both matter.
    preceding_text = (
        "\n".join([_chunk_to_text(chunk) for chunk in preceding_chunk_payloads])
        if preceding_chunk_payloads is not None
        else ""
    )
    following_text = (
        "\n".join([_chunk_to_text(chunk) for chunk in following_chunk_payloads])
        if following_chunk_payloads is not None
        else ""
    )

    if len(preceding_text) > config.CONTEXT_CHECKING.MAX_PREVIOUS_TEXT_CHARS:
        # Keep a prefix and suffix of long chapter intros for better context.
        prefix_chars = int(
            config.CONTEXT_CHECKING.MAX_PREVIOUS_TEXT_CHARS * config.CONTEXT_CHECKING.PREVIOUS_TEXT_TRUNCATE_RATIO
        )
        suffix_chars = config.CONTEXT_CHECKING.MAX_PREVIOUS_TEXT_CHARS - prefix_chars
        preceding_text = (
            preceding_text[:prefix_chars]
            + "\n...[TRUNCATED]...\n"
            + preceding_text[int(len(preceding_text) - suffix_chars) :]
        )

    if len(following_text) > config.CONTEXT_CHECKING.MAX_FOLLOWUP_TEXT_CHARS:
        following_text = following_text[: config.CONTEXT_CHECKING.MAX_FOLLOWUP_TEXT_CHARS]

    return ChunkWithContext(
        chunk_text=_chunk_to_text(base_chunk_payload),
        preceding_text=preceding_text,
        following_text=following_text,
        page_numbers=base_chunk_payload.page_numbers,
        document_name=base_chunk_payload.title,
        toc_path=base_chunk_payload.toc_path,
    )


def _render_prompt(
    chunk_a: ChunkWithContext,
    chunk_b: ChunkWithContext,
    project_meta: BaseMetadata,
    project_meta_status: ProjectBaseMetadataStatus,
    screening_note: str,
) -> str:
    """Render structured checker input as JSON for the LLM."""
    sanitized = sanitize_llm_input({"screening_note": screening_note})
    payload = ContextCheckerLLMInput(
        project_base_md=project_meta,
        project_base_md_status=project_meta_status,
        chunk_a=chunk_a,
        chunk_b=chunk_b,
        screening_note=sanitized["screening_note"],
    )
    return payload.model_dump_json(indent=2)


def _fetch_claim_pair_payloads(
    project_id: str, claim_id: str, reference_claim_id: str
) -> tuple[ClaimPayload, ClaimPayload]:
    """Fetch and return the two claim payloads involved in one context check."""
    claim_pair_payloads = qdrant_client.get_claim_payloads(
        project_id=project_id,
        claim_ids=[claim_id, reference_claim_id],
        with_vectors=False,
    )
    payload_by_id = {p.claim_id: p for p in claim_pair_payloads}
    if claim_id not in payload_by_id or reference_claim_id not in payload_by_id:
        raise ApplicationError(
            f"Could not retrieve both claim payloads: expected {claim_id!r} and {reference_claim_id!r}, "
            f"got {list(payload_by_id.keys())}",
            non_retryable=True,
        )
    return payload_by_id[claim_id], payload_by_id[reference_claim_id]


async def _verify_verdict_if_needed(
    original_verdict: ContextCheckVerdict,
    project_meta: BaseMetadata,
    project_meta_status: ProjectBaseMetadataStatus,
    chunk_a_context: ChunkWithContext,
    chunk_b_context: ChunkWithContext,
) -> VerificationOutput | None:
    """Run verifier LLM only when the checker rating reaches the configured threshold."""
    if original_verdict.rating < config.CONTEXT_CHECKING.RATING_THRESHOLD:
        return None

    verification_input = VerificationInput(
        project_md=project_meta,
        project_md_status=project_meta_status,
        chunk_a=chunk_a_context,
        chunk_b=chunk_b_context,
        original_verdict=original_verdict,
    )
    verification_prompt = verification_input.model_dump_json(indent=2)
    llm_response = await llm_client.ainvoke(
        system_prompt=wrap_system_prompt(CONFLICT_VERIFIER_SYSTEM_PROMPT, lang="de"),
        output_format=VerificationOutput,
        user_prompt=verification_prompt,
    )
    return VerificationOutput.model_validate(llm_response)


@activity.defn
async def check_conflict(request: ContextCheckerInput) -> ContextCheckerOutput:
    """Evaluate one screened claim pair and optionally verify the first verdict."""
    primary_claim_payload, reference_claim_payload = _fetch_claim_pair_payloads(
        project_id=request.project_id,
        claim_id=request.claim_id,
        reference_claim_id=request.reference_claim_id,
    )

    project_meta, project_meta_status = await dms_client.get_project_base_metadata(project_id=request.project_id)

    chunk_a_context = _build_chunk_context(
        chunk_id=primary_claim_payload.chunk_id,
        project_id=request.project_id,
    )
    chunk_b_context = _build_chunk_context(
        chunk_id=reference_claim_payload.chunk_id,
        project_id=request.project_id,
    )

    prompt = _render_prompt(
        chunk_a=chunk_a_context,
        chunk_b=chunk_b_context,
        project_meta=project_meta,
        project_meta_status=project_meta_status,
        screening_note=request.screening_note,
    )

    llm_response = await llm_client.ainvoke(
        system_prompt=wrap_system_prompt(CONFLICT_CHECKER_SYSTEM_PROMPT, lang="de"),
        output_format=ContextCheckVerdict,
        user_prompt=prompt,
    )
    original_verdict = ContextCheckVerdict.model_validate(llm_response)
    verification_response = await _verify_verdict_if_needed(
        original_verdict=original_verdict,
        project_meta=project_meta,
        project_meta_status=project_meta_status,
        chunk_a_context=chunk_a_context,
        chunk_b_context=chunk_b_context,
    )
    verified_verdict = verification_response.updated_verdict if verification_response else None

    return ContextCheckerOutput(
        chunk_a_id=primary_claim_payload.chunk_id,
        chunk_b_id=reference_claim_payload.chunk_id,
        claim_a_id=request.claim_id,
        claim_b_id=request.reference_claim_id,
        chunk_a_context=chunk_a_context,
        chunk_b_context=chunk_b_context,
        original_verdict=original_verdict,
        updated_verdict=verification_response.updated_verdict if verification_response else None,
        verification_explanation=verification_response.explanation if verification_response else None,
        is_verified_inconsistency=(
            verified_verdict.rating >= config.CONTEXT_CHECKING.RATING_THRESHOLD if verified_verdict else False
        ),
        screening_note=request.screening_note,
    )
