"""Non-LLM Temporal activities for context-checking data preparation.

The conflict-check LLM call itself lives in workflow code (see
``screening_context_batch_workflow``); this module only contains the Qdrant
data-gathering activities used to assemble the prompt input.
"""

from temporalio import activity

from src.config.config import config
from src.qdrant.schemas import ChunkPayload
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    BuildChunkContextsInput,
    ChunkWithContext,
)
from src.workflows.clients import qdrant_client


def _chunk_to_text(chunk: ChunkPayload) -> str:
    """
    Convert a ChunkPayload to text for downstream LLM prompts.

    - Text chunks: return the verbatim chunk text.
    - Non-text chunks: include the (LLM-generated) summary wrapped in LLM-generated markers
      so it's obvious where the non-verbatim section starts and ends.
    """
    if chunk.chunk_type == "text":
        return chunk.chunk_content.strip()

    summary = (chunk.summary or "").strip()

    if not summary:
        return ""

    return f"{config.CONTEXT_CHECKING.LLM_SUMMARY_BEGIN_MARKER}\n{summary}\n{config.CONTEXT_CHECKING.LLM_SUMMARY_END_MARKER}"


@activity.defn
async def build_chunk_contexts_batch(  # noqa: C901 -- phased pipeline (prev/next/build), splitting would add coupling
    inp: BuildChunkContextsInput,
) -> dict[str, ChunkWithContext]:
    """Build chunk contexts for all given chunk IDs using batched Qdrant fetches.

    Instead of fetching neighbors one-by-one per chunk (up to 12 sequential calls
    each), resolves the entire neighbor chain level-by-level in batch calls.
    This reduces O(N × depth) Qdrant calls to O(depth) batch calls.
    """
    project_id = inp.project_id
    if not inp.chunk_ids:
        return {}

    unique_chunk_ids = list(set(inp.chunk_ids))

    # 1. Bulk-fetch all base chunks in one call.
    base_chunks = await qdrant_client.get_chunk_payloads(
        project_id=project_id,
        chunk_ids=unique_chunk_ids,
    )
    chunk_cache: dict[str, ChunkPayload] = {c.chunk_id: c for c in base_chunks}

    # 2. Resolve previous-chunk chains level by level (up to MAX_PREVIOUS_CHUNKS).
    prev_chains: dict[str, list[str]] = {cid: [] for cid in unique_chunk_ids}
    frontier: dict[str, str] = {}
    for cid in unique_chunk_ids:
        if cid in chunk_cache:
            previous_chunk_id = chunk_cache[cid].previous_chunk_id
            if previous_chunk_id:
                frontier[cid] = previous_chunk_id

    for _level in range(config.CONTEXT_CHECKING.MAX_PREVIOUS_CHUNKS):
        if not frontier:
            break
        needed_ids = list({pid for pid in frontier.values() if pid not in chunk_cache})
        if needed_ids:
            new_chunks = await qdrant_client.get_chunk_payloads(project_id=project_id, chunk_ids=needed_ids)
            for c in new_chunks:
                chunk_cache[c.chunk_id] = c

        new_frontier: dict[str, str] = {}
        for base_id, prev_id in frontier.items():
            if prev_id in chunk_cache:
                prev_chains[base_id].append(prev_id)
                prev_chunk = chunk_cache[prev_id]
                if prev_chunk.previous_chunk_id:
                    new_frontier[base_id] = prev_chunk.previous_chunk_id
        frontier = new_frontier

    # 3. Resolve next-chunk chains level by level (up to MAX_FOLLOWUP_CHUNKS).
    next_chains: dict[str, list[str]] = {cid: [] for cid in unique_chunk_ids}
    frontier = {}
    for cid in unique_chunk_ids:
        if cid in chunk_cache:
            next_chunk_id = chunk_cache[cid].next_chunk_id
            if next_chunk_id:
                frontier[cid] = next_chunk_id

    for _level in range(config.CONTEXT_CHECKING.MAX_FOLLOWUP_CHUNKS):
        if not frontier:
            break
        needed_ids = list({nid for nid in frontier.values() if nid not in chunk_cache})
        if needed_ids:
            new_chunks = await qdrant_client.get_chunk_payloads(project_id=project_id, chunk_ids=needed_ids)
            for c in new_chunks:
                chunk_cache[c.chunk_id] = c

        new_frontier: dict[str, str] = {}
        for base_id, next_id in frontier.items():
            if next_id in chunk_cache:
                next_chains[base_id].append(next_id)
                next_chunk = chunk_cache[next_id]
                if next_chunk.next_chunk_id:
                    new_frontier[base_id] = next_chunk.next_chunk_id
        frontier = new_frontier

    # 4. Build contexts from cached data (no further Qdrant calls).
    contexts: dict[str, ChunkWithContext] = {}
    for chunk_id in unique_chunk_ids:
        if chunk_id not in chunk_cache:
            continue
        base = chunk_cache[chunk_id]

        # Previous payloads arrive nearest-first; filter by same TOC section.
        preceding_payloads = [chunk_cache[pid] for pid in prev_chains[chunk_id] if pid in chunk_cache]
        following_payloads = [chunk_cache[nid] for nid in next_chains[chunk_id] if nid in chunk_cache]

        # Keep only neighbors from the same top-level chapter (toc_path[0]) as the base
        # chunk. This is intentionally broader than an exact full-path match: it allows
        # context to flow across sub-sections within the same chapter, giving the LLM
        # more surrounding material to work with. Chunks with no TOC path (empty list)
        # are treated as section-less and included regardless of the base chunk's path.
        preceding_payloads = [
            p for p in preceding_payloads if not p.toc_path or not base.toc_path or p.toc_path[0] == base.toc_path[0]
        ]
        following_payloads = [
            f for f in following_payloads if not f.toc_path or not base.toc_path or f.toc_path[0] == base.toc_path[0]
        ]

        # Reverse to restore reading order.
        preceding_payloads = preceding_payloads[::-1]

        preceding_text = "\n".join([_chunk_to_text(c) for c in preceding_payloads]) if preceding_payloads else ""
        following_text = "\n".join([_chunk_to_text(c) for c in following_payloads]) if following_payloads else ""

        if len(preceding_text) > config.CONTEXT_CHECKING.MAX_PREVIOUS_TEXT_CHARS:
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

        contexts[chunk_id] = ChunkWithContext(
            document_id=base.document_id,
            chunk_text=_chunk_to_text(base),
            preceding_text=preceding_text,
            following_text=following_text,
            page_numbers=base.page_numbers,
            document_name=base.title,
            toc_path=base.toc_path,
        )

    return contexts
