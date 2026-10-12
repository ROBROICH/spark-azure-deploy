"""Temporal activity that turns clusters into notes ready for scoring (LLM-free).

One note per cluster: anchored locations, deterministic evidence, verifier evidence block,
page contexts and gate reason for the rubric.
"""

from __future__ import annotations

from temporalio import activity

from src.activities import evidence
from src.activities.prefilter import build_page_contexts, page_key
from src.activities.scoring import PROBE_CHARS, gate_reason
from src.config.config import config
from src.workflows.check_logic_wf.schemas.clustering_schemas import InconsistencyPair
from src.workflows.check_logic_wf.schemas.note_schemas import (
    BuildNotesInput,
    BuildNotesOutput,
    ChunkContextLite,
    EvidenceLocation,
    Note,
    PageContext,
)
from src.workflows.clients import qdrant_client


def _location(
    chunk_id: str,
    excerpt: str,
    ctx: ChunkContextLite | None,
    pages: dict[str, PageContext],
    objects: list[str] | None = None,
) -> EvidenceLocation:
    p = config.NOTE_VERIFIER
    if ctx is None:
        return EvidenceLocation(
            chunk_id=chunk_id, document_id="", excerpt=excerpt, anchor="fehlt", objects=objects or []
        )
    page = ctx.page_numbers[0] if ctx.page_numbers else None
    page_ctx = pages.get(page_key(ctx.document_id, page)) if page is not None else None
    return EvidenceLocation(
        chunk_id=chunk_id,
        document_id=ctx.document_id,
        document_name=ctx.document_name,
        page=page,
        excerpt=excerpt,
        anchor=evidence.anchor_kind(excerpt, ctx.chunk_text),
        chunk_text=ctx.chunk_text[: p.MAX_CHUNK_TEXT_STORED_CHARS],
        chunk_is_ai_text=evidence.is_ai_text(ctx.chunk_text),
        toc_path=list(ctx.toc_path),
        prev_text=ctx.preceding_text[-p.NEIGHBOR_TEXT_CHARS :],
        next_text=ctx.following_text[: p.NEIGHBOR_TEXT_CHARS],
        # Cut around the excerpt to keep large clusters below Temporal's payload limit.
        page_text=_page_window(page_ctx.text, excerpt) if page_ctx else "",
        objects=objects or [],
    )


def locations_for_cluster(
    edges: list[InconsistencyPair],
    chunk_contexts: dict[str, ChunkContextLite],
    pages: dict[str, PageContext],
    claim_objects: dict[str, str] | None = None,
) -> list[EvidenceLocation]:
    """Distinct (chunk, excerpt) locations of a cluster, strongest edge first, with their claim objects."""
    claim_objects = claim_objects or {}
    seen: dict[tuple[str, str], EvidenceLocation] = {}
    order: list[tuple[str, str]] = []
    for e in sorted(edges, key=lambda x: -x.rating):
        for chunk_id, excerpt, claim_id in (
            (e.chunk_a_id, e.content_a_excerpt, e.claim_a_id),
            (e.chunk_b_id, e.content_b_excerpt, e.claim_b_id),
        ):
            key = (chunk_id, evidence.norm(excerpt).lower())
            obj = claim_objects.get(claim_id, "")
            if key not in seen:
                seen[key] = _location(chunk_id, excerpt, chunk_contexts.get(chunk_id), pages, [obj] if obj else [])
                order.append(key)
            elif obj and obj not in seen[key].objects:
                seen[key].objects.append(obj)
    return [seen[k] for k in order]


def _page_window(text: str, excerpt: str) -> str:
    """Page text around the excerpt, capped at NOTE_VERIFIER.MAX_PAGE_TEXT_STORED_CHARS."""
    max_chars = config.NOTE_VERIFIER.MAX_PAGE_TEXT_STORED_CHARS
    if len(text) <= max_chars:
        return text
    probe = excerpt[:PROBE_CHARS]
    j = text.find(probe) if probe else -1
    start = max(0, j - max_chars // 2) if j >= 0 else 0
    return text[start : start + max_chars]


def build_note(
    note_id: str,
    edges: list[InconsistencyPair],
    chunk_contexts: dict[str, ChunkContextLite],
    pages: dict[str, PageContext],
    corpus: evidence.Corpus,
    claim_objects: dict[str, str] | None = None,
) -> Note:
    """Assemble one note from its cluster edges (pure)."""
    strongest = max(edges, key=lambda e: e.rating)
    fs = locations_for_cluster(edges, chunk_contexts, pages, claim_objects)
    signals = evidence.signals_for_note(fs, wording_also_current=evidence.wording_also_current(fs, corpus))
    return Note(
        note_id=note_id,
        title=strongest.title,
        description=strongest.explanation,
        rating=max(e.rating for e in edges),
        locations=fs,
        edges=edges,
        signals=signals,
        score_det=evidence.deterministic_score(signals),
        evidence_block=evidence.evidence_block_for(fs, corpus),
        gate_reason=gate_reason(fs),
    )


def _page_keys(
    clusters: list[list[InconsistencyPair]], chunk_contexts: dict[str, ChunkContextLite]
) -> list[tuple[str, int]]:
    keys: dict[tuple[str, int], None] = {}
    for edges in clusters:
        for e in edges:
            for chunk_id in (e.chunk_a_id, e.chunk_b_id):
                ctx = chunk_contexts.get(chunk_id)
                if ctx and ctx.page_numbers:
                    keys[(ctx.document_id, ctx.page_numbers[0])] = None
    return list(keys)


@activity.defn
async def build_notes(inp: BuildNotesInput) -> BuildNotesOutput:
    """Build notes for all clusters of one document (Qdrant reads: page chunks + project text corpus)."""
    if not inp.clusters:
        return BuildNotesOutput(notes=[], pages={})

    page_chunks = await qdrant_client.get_chunk_payloads_by_document_pages(
        project_id=inp.project_id, pages=_page_keys(inp.clusters, inp.chunk_contexts)
    )
    pages = build_page_contexts(page_chunks)

    raw = await qdrant_client.list_project_text_chunks(inp.project_id)
    corpus = evidence.Corpus(
        [evidence.CorpusChunk(document_name=name, page_numbers=tuple(pn), text=text) for _, name, pn, text in raw]
    )

    # Model-extracted objects of the claims behind the edges (empty on legacy claims).
    claim_ids = list({cid for edges in inp.clusters for e in edges for cid in (e.claim_a_id, e.claim_b_id)})
    claim_objects = {
        c.claim_id: c.objekt
        for c in await qdrant_client.get_claim_payloads(project_id=inp.project_id, claim_ids=claim_ids)
        if c.objekt
    }

    notes = [
        build_note(f"{inp.document_id}:{i}", edges, inp.chunk_contexts, pages, corpus, claim_objects)
        for i, edges in enumerate(inp.clusters)
        if edges
    ]
    # The page text already travels with each location.
    return BuildNotesOutput(
        notes=notes,
        pages={k: v.model_copy(update={"text": ""}) for k, v in pages.items()},
    )
