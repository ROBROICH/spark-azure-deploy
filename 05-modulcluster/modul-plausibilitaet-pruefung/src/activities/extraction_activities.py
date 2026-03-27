"""Temporal activities for claim extraction."""

from uuid import uuid4

from temporalio import activity, workflow

from src.qdrant.schemas import ChunkPayload, ClaimEvidence, ClaimMetadata, ClaimPayload
from src.workflows.qdrant_wf.schemas.table_extraction import ParsedTable, TableExtractionResponse

with workflow.unsafe.imports_passed_through():
    from prompt_defense import sanitize_llm_input, wrap_system_prompt

    from src.workflows.clients import llm_client
    from src.workflows.qdrant_wf.prompts.table_extraction import (
        TABLE_SEPARATOR_SYSTEM_PROMPT,
        TABLE_SEPARATOR_USER_PROMPT,
    )
    from src.workflows.qdrant_wf.prompts.table_formulator import (
        TABLE_FORMULATOR_SYSTEM_PROMPT,
        TABLE_FORMULATOR_USER_PROMPT,
    )
    from src.workflows.qdrant_wf.prompts.text_extraction import (
        CLAIM_EXTRACTION_SYSTEM_PROMPT,
        CLAIM_EXTRACTION_USER_PROMPT,
    )
    from src.workflows.qdrant_wf.prompts.text_formulator import (
        CLAIM_FORMULATION_SYSTEM_PROMPT,
        CLAIM_FORMULATION_USER_PROMPT,
    )
    from src.workflows.qdrant_wf.schemas.text_extraction import (
        ClaimQuotes,
        TextClaimFormulation,
    )
    from src.workflows.qdrant_wf.schemas.workflow import (
        ExtractClaimsFromRowBatchInput,
        ExtractTextClaimsInput,
    )


def _build_claim_payloads(
    project_id: str,
    document_id: str,
    title: str,
    chunk_id: str,
    erlauterungsbericht: bool,
    claims: list[str],
    evidence_quotes: list[str],
) -> list[ClaimPayload]:
    """Build ClaimPayload list from extracted claims with shared metadata."""
    return [
        ClaimPayload(
            project_id=project_id,
            document_id=document_id,
            title=title,
            chunk_id=chunk_id,
            erlauterungsbericht=erlauterungsbericht,
            claim_metadata=ClaimMetadata(
                claim_id=str(uuid4()),
                evidence=ClaimEvidence(
                    claim_quotes=evidence_quotes,
                ),
                claim_content=t,
            ),
            vector=None,
        )
        for t in claims
    ]


@activity.defn
async def extract_text_claims(inp: ExtractTextClaimsInput) -> list[ClaimPayload]:
    """Extract claims from a text chunk. Makes 2 sequential LLM calls."""
    chunk = inp.chunk
    sanitized_chunk_content = sanitize_llm_input({"chunk_text": chunk.chunk_content})

    extraction_res: ClaimQuotes = await llm_client.ainvoke(
        CLAIM_EXTRACTION_USER_PROMPT.format(**sanitized_chunk_content),
        system_prompt=wrap_system_prompt(CLAIM_EXTRACTION_SYSTEM_PROMPT, lang="de"),
        output_format=ClaimQuotes,
    )
    if not extraction_res.claim_quotes:
        return []

    sanitized_formulation_input = sanitize_llm_input(
        {
            "chunk_text": chunk.chunk_content,
            "claim_quotes": str(extraction_res.claim_quotes),
        }
    )
    final_response: TextClaimFormulation = await llm_client.ainvoke(
        CLAIM_FORMULATION_USER_PROMPT.format(**sanitized_formulation_input),
        system_prompt=wrap_system_prompt(CLAIM_FORMULATION_SYSTEM_PROMPT, lang="de"),
        output_format=TextClaimFormulation,
    )

    return _build_claim_payloads(
        project_id=inp.project_id,
        document_id=inp.document_id,
        title=chunk.title,
        chunk_id=chunk.chunk_id,
        erlauterungsbericht=inp.erlauterungsbericht,
        claims=final_response.claims,
        evidence_quotes=extraction_res.claim_quotes,
    )


@activity.defn
async def parse_table_structure(chunk: ChunkPayload) -> ParsedTable:
    """Parse raw table content into structured header + rows. Makes 1 LLM call."""
    if chunk.chunk_type != "table":
        raise ValueError("Chunk is not a table")

    content = chunk.chunk_content
    sanitized_chunk_content = sanitize_llm_input({"chunk_text": content})
    table_extraction_response: TableExtractionResponse = await llm_client.ainvoke(
        user_prompt=TABLE_SEPARATOR_USER_PROMPT.format(**sanitized_chunk_content),
        system_prompt=wrap_system_prompt(TABLE_SEPARATOR_SYSTEM_PROMPT, lang="de"),
        output_format=TableExtractionResponse,
    )

    return ParsedTable(
        chunk_id=chunk.chunk_id,
        raw_content=content,
        header=table_extraction_response.header,
        rows=table_extraction_response.rows,
        title=chunk.title,
    )


@activity.defn
async def extract_claims_from_row_batch(inp: ExtractClaimsFromRowBatchInput) -> list[ClaimPayload]:
    """Formulate atomic claims from a batch of table rows. Makes 1 LLM call."""
    table = inp.table
    sanitized_input = sanitize_llm_input(
        {
            "header": table.header,
            "rows": "\n".join([str(r) for r in table.rows]),
        }
    )
    result: TextClaimFormulation = await llm_client.ainvoke(
        TABLE_FORMULATOR_USER_PROMPT.format(**sanitized_input),
        system_prompt=wrap_system_prompt(TABLE_FORMULATOR_SYSTEM_PROMPT, lang="de"),
        output_format=TextClaimFormulation,
    )

    return _build_claim_payloads(
        project_id=inp.project_id,
        document_id=inp.document_id,
        title=table.title,
        chunk_id=table.chunk_id,
        erlauterungsbericht=inp.erlauterungsbericht,
        claims=result.claims,
        evidence_quotes=[table.raw_content],
    )
