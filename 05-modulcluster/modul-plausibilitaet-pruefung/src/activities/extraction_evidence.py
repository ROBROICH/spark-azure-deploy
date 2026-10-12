"""Identifiers captured per chunk at claim-extraction time (pure).

``instance_identifiers`` are read from the whole page, since a template header usually lives in
another chunk; ``object_ids`` from the chunk text. Claims without them fall back to fetching page text.
"""

from __future__ import annotations

from src.activities.identifiers import identifiers
from src.activities.prefilter import build_page_contexts, page_key
from src.config.config import config
from src.qdrant.schemas import ChunkPayload


def annotate_chunks(chunks: list[ChunkPayload]) -> list[ChunkPayload]:
    """Return copies of ``chunks`` with extraction-evidence fields set."""
    if not chunks:
        return chunks
    pages = build_page_contexts(chunks)
    out: list[ChunkPayload] = []
    for c in chunks:
        classes: dict[str, set[str]] = {}
        for p in c.page_numbers:
            ctx = pages.get(page_key(c.document_id, p))
            if not ctx:
                continue
            for klasse, values in ctx.identifiers.items():
                classes.setdefault(klasse, set()).update(values)
        out.append(
            c.model_copy(
                update={
                    "instance_identifiers": {k: sorted(v) for k, v in sorted(classes.items())},
                    "object_ids": sorted(identifiers(c.chunk_content[: config.EXTRACTION.OBJECT_ID_TEXT_CHARS])),
                }
            )
        )
    return out
