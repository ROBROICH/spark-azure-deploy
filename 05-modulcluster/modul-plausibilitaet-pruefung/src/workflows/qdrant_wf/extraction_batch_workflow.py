"""Child workflow that processes a batch of chunks for claim extraction.

LLM activities are invoked directly from the workflow so the task queue resolves from the model.
"""

import json
import re
from typing import TypedDict

from prompt_injection.prompt_defense import sanitize_and_wrap_external_data, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporal.activities.models import ChatModel
from temporal.utils import sliding_window
from temporalio import workflow

from src.activities.evidence import is_superseded
from src.config.config import config
from src.config.env import ENV
from src.qdrant.schemas import ChunkPayload, ClaimEvidence, ClaimMetadata, ClaimPayload
from src.workflows.qdrant_wf.prompts.table_claim_extraction import (
    TABLE_CLAIM_EXTRACTION_SYSTEM_PROMPT,
    TABLE_CLAIM_EXTRACTION_USER_PROMPT,
)
from src.workflows.qdrant_wf.prompts.text_extraction import (
    GROUPED_CLAIM_EXTRACTION_SYSTEM_PROMPT,
    GROUPED_CLAIM_EXTRACTION_USER_PROMPT,
)
from src.workflows.qdrant_wf.schemas.text_extraction import (
    GroupedExtractionResponse,
    TextClaimFormulation,
)
from src.workflows.qdrant_wf.schemas.workflow import ExtractionBatchInput, ExtractionBatchOutput


def _group_text_chunks(chunks: list[ChunkPayload], group_size: int, max_chars: int) -> list[list[ChunkPayload]]:
    """Split text chunks into groups respecting both a count limit and a cumulative character budget."""
    groups: list[list[ChunkPayload]] = []
    current: list[ChunkPayload] = []
    chars = 0

    for chunk in chunks:
        size = len(chunk.chunk_content) + _JSON_OVERHEAD_CHARS
        if current and (len(current) >= group_size or chars + size > max_chars):
            groups.append(current)
            current = []
            chars = 0
        current.append(chunk)
        chars += size

    if current:
        groups.append(current)
    return groups


# Approximate JSON overhead per chunk in an extraction batch.
_JSON_OVERHEAD_CHARS = 120
_OBJECT_MAX_CHARS = 60
_TR_PATTERN = re.compile(r"(<tr[\s>].*?</tr>)", re.IGNORECASE | re.DOTALL)


def _split_by_chars(chunk: ChunkPayload, max_chars: int) -> list[ChunkPayload]:
    """Fallback: split raw HTML at character boundaries, preferring ``</tr>`` break points."""
    html = chunk.chunk_content
    chunks: list[ChunkPayload] = []

    while len(html) > max_chars:
        # Try to break at the last </tr> before the budget
        cut = html.rfind("</tr>", 0, max_chars)
        if cut != -1:
            cut += len("</tr>")
        else:
            # No </tr> found — hard cut at budget
            cut = max_chars
        chunks.append(chunk.model_copy(update={"chunk_content": html[:cut]}))
        html = html[cut:]

    if html:
        chunks.append(chunk.model_copy(update={"chunk_content": html}))

    return chunks


def _split_large_table(chunk: ChunkPayload, max_chars: int) -> list[ChunkPayload]:
    """Split an HTML table chunk by rows (header repeated) when it exceeds *max_chars*.

    An over-budget row gets its own chunk instead of being dropped; unparseable HTML is split by characters.
    """
    html = chunk.chunk_content
    if len(html) <= max_chars:
        return [chunk]

    rows = _TR_PATTERN.findall(html)
    if len(rows) <= 1:
        # Unparseable or only a header — fall back to character splitting
        return _split_by_chars(chunk, max_chars)

    header_row = rows[0]
    data_rows = rows[1:]
    table_open = "<table>"
    table_close = "</table>"
    base_size = len(table_open) + len(header_row) + len(table_close)

    chunks: list[ChunkPayload] = []
    current_rows: list[str] = []
    current_size = base_size

    for row in data_rows:
        row_size = len(row)
        if current_rows and current_size + row_size > max_chars:
            sub_html = table_open + header_row + "".join(current_rows) + table_close
            chunks.append(chunk.model_copy(update={"chunk_content": sub_html}))
            current_rows = []
            current_size = base_size
        current_rows.append(row)
        current_size += row_size

    if current_rows:
        sub_html = table_open + header_row + "".join(current_rows) + table_close
        chunks.append(chunk.model_copy(update={"chunk_content": sub_html}))

    return chunks


@workflow.defn
class ClaimExtractionBatchWorkflow:
    """Processes a batch of ≤ CHILD_WORKFLOW_BATCH_SIZE chunks and returns all extracted claims."""

    @workflow.run
    async def run(self, inp: ExtractionBatchInput) -> ExtractionBatchOutput:
        model: ChatModel = ENV.LITELLM.MODEL

        # Group text chunks for batched extraction (1 LLM call per group)
        chunk_groups = _group_text_chunks(
            inp.text_chunks,
            config.QDRANT_BUILDER.EXTRACTION_CHUNKS_PER_BATCH,
            config.QDRANT_BUILDER.EXTRACTION_MAX_CHARS_PER_BATCH,
        )

        text_claims_list = await sliding_window(
            chunk_groups,
            lambda group: _extract_text_claims_grouped(
                project_id=inp.project_id,
                document_id=inp.document_id,
                erlauterungsbericht=inp.is_erlaeuterungsbericht,
                chunks=group,
                model=model,
            ),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )
        text_claims = [c for sub in text_claims_list for c in sub]

        # Split large tables by rows so each stays within the character budget
        table_chunks: list[ChunkPayload] = []
        for tc in inp.table_chunks:
            table_chunks.extend(_split_large_table(tc, config.QDRANT_BUILDER.TABLE_MAX_CHARS))

        # Extract table claims — 1 LLM call per (possibly split) table chunk
        table_claims_list = await sliding_window(
            table_chunks,
            lambda chunk: _extract_table_claims(
                project_id=inp.project_id,
                document_id=inp.document_id,
                erlauterungsbericht=inp.is_erlaeuterungsbericht,
                chunk=chunk,
                model=model,
            ),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )
        table_claims = [c for sub in table_claims_list for c in sub]

        return ExtractionBatchOutput(claims=text_claims + table_claims)


async def _extract_text_claims_grouped(
    project_id: str,
    document_id: str,
    erlauterungsbericht: bool,
    chunks: list[ChunkPayload],
    model: ChatModel,
) -> list[ClaimPayload]:
    """Extract and formulate claims from multiple text chunks in a single LLM call."""
    if not chunks:
        return []

    # Build indexed input for the LLM
    chunks_input = [
        {
            "chunk_id": idx,
            "text": chunk.chunk_content,
        }
        for idx, chunk in enumerate(chunks, start=1)
    ]
    user_prompt = GROUPED_CLAIM_EXTRACTION_USER_PROMPT.format(
        chunks_json=sanitize_and_wrap_external_data(json.dumps(chunks_input, ensure_ascii=False, indent=2))
    )

    response = await llm_invoke_structured(
        prompt=user_prompt,
        system_prompt=wrap_system_prompt(GROUPED_CLAIM_EXTRACTION_SYSTEM_PROMPT, lang="de"),
        output_class=GroupedExtractionResponse,
        model=model,
        temperature=0.0,
        top_p=1.0,
        reasoning_effort=config.QDRANT_BUILDER.EXTRACTION_REASONING_EFFORT,
        retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
    )

    # Map 1-based chunk_id back to original ChunkPayload
    idx_to_chunk = dict(enumerate(chunks, start=1))

    claims: list[ClaimPayload] = []
    for item in response.claims:
        chunk = idx_to_chunk.get(item.chunk_id)
        if not chunk:
            workflow.logger.warning(
                "LLM returned invalid chunk_id=%s (valid: 1\u2013%d), dropping claim",
                item.chunk_id,
                len(chunks),
            )
            continue
        claims.append(
            ClaimPayload(
                project_id=project_id,
                document_id=document_id,
                title=chunk.title,
                chunk_id=chunk.chunk_id,
                erlauterungsbericht=erlauterungsbericht,
                claim_metadata=ClaimMetadata(
                    claim_id=str(workflow.uuid4()),
                    evidence=ClaimEvidence(
                        claim_quotes=item.quotes,
                    ),
                    claim_content=item.claim,
                ),
                vector=None,
                objekt=item.objekt[:_OBJECT_MAX_CHARS],
                **_extraction_evidence_fields(chunk),
            )
        )

    return claims


class _ExtractionEvidenceFields(TypedDict):
    instance_identifiers: dict[str, list[str]]
    object_ids: list[str]
    superseded: bool


def _extraction_evidence_fields(chunk: ChunkPayload) -> _ExtractionEvidenceFields:
    """Evidence captured at extraction time."""
    return _ExtractionEvidenceFields(
        instance_identifiers=chunk.instance_identifiers,
        object_ids=chunk.object_ids,
        superseded=is_superseded(chunk.title),
    )


async def _extract_table_claims(
    project_id: str,
    document_id: str,
    erlauterungsbericht: bool,
    chunk: ChunkPayload,
    model: ChatModel,
) -> list[ClaimPayload]:
    """Extract atomic claims directly from an HTML table chunk. Makes 1 LLM call."""
    if chunk.chunk_type != "table":
        raise ValueError("Chunk is not a table")

    result: TextClaimFormulation = await llm_invoke_structured(
        prompt=TABLE_CLAIM_EXTRACTION_USER_PROMPT.format(
            table_html=sanitize_and_wrap_external_data(chunk.chunk_content),
        ),
        system_prompt=wrap_system_prompt(TABLE_CLAIM_EXTRACTION_SYSTEM_PROMPT, lang="de"),
        output_class=TextClaimFormulation,
        model=model,
        temperature=0.0,
        top_p=1.0,
        reasoning_effort=config.QDRANT_BUILDER.EXTRACTION_REASONING_EFFORT,
        retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
    )

    return [
        ClaimPayload(
            project_id=project_id,
            document_id=document_id,
            title=chunk.title,
            chunk_id=chunk.chunk_id,
            erlauterungsbericht=erlauterungsbericht,
            claim_metadata=ClaimMetadata(
                claim_id=str(workflow.uuid4()),
                evidence=ClaimEvidence(
                    claim_quotes=[chunk.chunk_content],
                ),
                claim_content=t,
            ),
            vector=None,
            **_extraction_evidence_fields(chunk),
        )
        for t in result.claims
    ]
