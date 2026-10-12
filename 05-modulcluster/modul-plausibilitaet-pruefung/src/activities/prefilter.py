"""Deterministic, LLM-free pre-filter in front of the context checker.

Drops trivial pairs (identical text), template instances (same identifier class with
disjoint values on the two pages) and version duplicates (same basename and TOC section).
The rules are deliberately narrow: neither the same page nor the same document without the
same TOC section makes a pair trivial or a duplicate.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from temporalio import activity

from src.activities.identifiers import class_conflict, template_identifiers
from src.activities.scoring import norm_words
from src.config.config import config
from src.qdrant.schemas import ChunkPayload
from src.workflows.check_logic_wf.schemas.context_checker_schemas import ChunkWithContext
from src.workflows.check_logic_wf.schemas.note_schemas import FetchPageContextsInput, PageContext, PageKey
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import ScreeningHit
from src.workflows.clients import qdrant_client


def _norm(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def page_identifiers(page_text: str) -> dict[str, list[str]]:
    """Template-instance identifiers of a page, by class."""
    return template_identifiers(page_text)


def page_key(document_id: str, page: int) -> str:
    """Dictionary key shared with :class:`PageKey`."""
    return f"{document_id}#{page}"


def build_page_contexts(chunks: list[ChunkPayload]) -> dict[str, PageContext]:
    """Group chunk texts by (document, page) into page contexts, in fetch order."""
    texts: dict[str, list[str]] = defaultdict(list)
    toc: dict[str, list[str]] = {}
    meta: dict[str, tuple[str, int]] = {}
    for c in chunks:
        txt = c.chunk_content if c.chunk_type == "text" else (c.summary or "")
        if not txt:
            continue
        for p in c.page_numbers:
            k = page_key(c.document_id, p)
            texts[k].append(txt)
            meta[k] = (c.document_id, p)
            if c.toc_path and k not in toc:
                toc[k] = list(c.toc_path)
    out: dict[str, PageContext] = {}
    for k, parts in texts.items():
        doc, p = meta[k]
        text = _norm(" \n ".join(parts))
        out[k] = PageContext(
            document_id=doc, page=p, text=text, toc_path=toc.get(k, []), identifiers=page_identifiers(text)
        )
    return out


@activity.defn
async def fetch_page_contexts_batch(inp: FetchPageContextsInput) -> dict[str, PageContext]:
    """Fetch all chunks of the requested (document, page) pairs and build page contexts."""
    if not inp.keys:
        return {}
    unique: dict[str, PageKey] = {k.key: k for k in inp.keys}
    keys = list(unique.values())
    result: dict[str, PageContext] = {}
    batch = config.PREFILTER.PAGE_FETCH_BATCH_SIZE
    for i in range(0, len(keys), batch):
        chunks = await qdrant_client.get_chunk_payloads_by_document_pages(
            project_id=inp.project_id,
            pages=[(k.document_id, k.page) for k in keys[i : i + batch]],
        )
        result.update(build_page_contexts(chunks))
    # Keep only requested keys (a chunk may span several pages).
    return {k: v for k, v in result.items() if k in unique}


# ---------------------------------------------------------------------------
# Pair rules
# ---------------------------------------------------------------------------


@dataclass
class PrefilterResult:
    """Outcome of the pre-filter for one batch of hits."""

    kept: list[ScreeningHit]
    rejected: dict[str, int] = field(default_factory=dict)


def _first_page(ctx: ChunkWithContext) -> int | None:
    return ctx.page_numbers[0] if ctx.page_numbers else None


def trivial(a: ChunkWithContext, b: ChunkWithContext, text_a: str, text_b: str, same_chunk: bool = False) -> bool:
    """Identical text on both sides.

    Claims from the same chunk are never trivial: document-internal number conflicts live there.
    """
    na, nb = norm_words(text_a), norm_words(text_b)
    if na and na == nb:
        return True
    if same_chunk:
        return False
    ca, cb = norm_words(a.chunk_text), norm_words(b.chunk_text)
    return bool(ca) and ca == cb


def instance_conflict(
    a: ChunkWithContext,
    b: ChunkWithContext,
    pages: dict[str, PageContext],
    ids_a: dict[str, list[str]] | None = None,
    ids_b: dict[str, list[str]] | None = None,
) -> str | None:
    """Identifier class with disjoint values on the two pages, if any.

    Prefers identifiers stored on the claims; falls back to the page contexts.
    """
    if ids_a and ids_b:
        return class_conflict(ids_a, ids_b)
    pa, pb = _first_page(a), _first_page(b)
    if pa is None or pb is None:
        return None
    ka = pages.get(page_key(a.document_id, pa))
    kb = pages.get(page_key(b.document_id, pb))
    if not ka or not kb:
        return None
    return class_conflict(ka.identifiers, kb.identifiers)


def version_duplicate(a: ChunkWithContext, b: ChunkWithContext) -> bool:
    """Same basename, different document, identical non-empty TOC section."""
    if a.document_id == b.document_id:
        return False
    if (a.document_name or "").split("/")[-1] != (b.document_name or "").split("/")[-1]:
        return False
    return bool(a.toc_path) and a.toc_path == b.toc_path


def rejection_reason(
    a: ChunkWithContext,
    b: ChunkWithContext,
    text_a: str,
    text_b: str,
    pages: dict[str, PageContext],
    ids_a: dict[str, list[str]] | None = None,
    ids_b: dict[str, list[str]] | None = None,
    same_chunk: bool = False,
) -> str | None:
    """Reason the pair is dropped before the checker, or None to keep it."""
    if trivial(a, b, text_a, text_b, same_chunk):
        return "trivial"
    if instance_conflict(a, b, pages, ids_a, ids_b):
        return "instanzkonflikt"
    if version_duplicate(a, b):
        return "versionsdublette"
    return None


def filter_hits(
    hits: list[ScreeningHit],
    claim_to_chunk: dict[str, str],
    chunk_contexts: dict[str, ChunkWithContext],
    claim_texts: dict[str, str],
    pages: dict[str, PageContext],
    instance_ids: dict[str, dict[str, list[str]]] | None = None,
) -> PrefilterResult:
    """Apply the pre-filter to screening hits with resolved contexts."""
    instance_ids = instance_ids or {}
    kept: list[ScreeningHit] = []
    rejected: dict[str, int] = defaultdict(int)
    for hit in hits:
        chunk_a, chunk_b = claim_to_chunk[hit.claim_id], claim_to_chunk[hit.reference_id]
        a, b = chunk_contexts[chunk_a], chunk_contexts[chunk_b]
        reason = rejection_reason(
            a,
            b,
            claim_texts.get(hit.claim_id, ""),
            claim_texts.get(hit.reference_id, ""),
            pages,
            instance_ids.get(hit.claim_id),
            instance_ids.get(hit.reference_id),
            same_chunk=chunk_a == chunk_b,
        )
        if reason:
            rejected[reason] += 1
        else:
            kept.append(hit)
    return PrefilterResult(kept=kept, rejected=dict(rejected))


def page_keys_for_hits(
    hits: list[ScreeningHit],
    claim_to_chunk: dict[str, str],
    chunk_contexts: dict[str, ChunkWithContext],
    instance_ids: dict[str, dict[str, list[str]]] | None = None,
) -> list[PageKey]:
    """Distinct (document, first page) keys the instance rule still has to fetch."""
    instance_ids = instance_ids or {}
    seen: dict[str, PageKey] = {}
    for hit in hits:
        if instance_ids.get(hit.claim_id) and instance_ids.get(hit.reference_id):
            continue
        for claim in (hit.claim_id, hit.reference_id):
            ctx = chunk_contexts.get(claim_to_chunk.get(claim, ""))
            if ctx is None:
                continue
            p = _first_page(ctx)
            if p is None:
                continue
            k = PageKey(document_id=ctx.document_id, page=p)
            seen.setdefault(k.key, k)
    return list(seen.values())
