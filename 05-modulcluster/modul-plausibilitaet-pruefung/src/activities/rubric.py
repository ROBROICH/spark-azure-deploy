"""Prompt construction for the extractive rubric (pure).

The page context matters: the identifier that separates two template instances often
sits on the same page but in another chunk. The chunk-context variant is the second view.
"""

from __future__ import annotations

from src.activities.scoring import PROBE_CHARS, norm_ws
from src.config.config import config
from src.workflows.check_logic_wf.schemas.note_schemas import EvidenceLocation, Note


def prompt_locations(note: Note) -> list[EvidenceLocation]:
    """The locations shown to the rubric, in prompt order (aligned with ``RubricResponse.stellen``)."""
    return note.locations[: config.RUBRIC.MAX_LOCATIONS_IN_PROMPT]


def _window(text: str, excerpt: str, max_chars: int) -> str:
    """Cut the page around the excerpt."""
    probe = excerpt[:PROBE_CHARS] if len(excerpt) > PROBE_CHARS else excerpt
    j = text.find(probe) if probe else -1
    if j >= 0:
        a = max(0, j - max_chars // 2)
        return text[a : a + max_chars]
    return text[:max_chars]


def rubric_prompt_page(note: Note) -> str:
    """Rubric user prompt with the whole page per location (falls back to the chunk text)."""
    p = config.RUBRIC
    teile: list[str] = []
    for i, f in enumerate(prompt_locations(note), 1):
        e = norm_ws(f.excerpt)
        txt = norm_ws(f.page_text) or norm_ws(f.chunk_text)
        txt = _window(txt, e, p.MAX_PAGE_CHARS) if txt else e
        teile.append(
            f"### Textstelle {i}\nDokument: {(f.document_name or '').split('/')[-1]}\n"
            f"Seite: {f.page}\nGliederung: {' > '.join(f.toc_path) if f.toc_path else '-'}\n"
            f"Zitat: {e[: p.MAX_EXCERPT_CHARS]}\nGanze Seite: {txt}"
        )
    return "\n\n".join(teile)


def rubric_prompt_chunk(note: Note) -> str:
    """Second view: chunk-local context instead of the page (self-consistency check)."""
    p = config.RUBRIC
    teile: list[str] = []
    for i, f in enumerate(prompt_locations(note), 1):
        e = norm_ws(f.excerpt)
        txt = norm_ws(f.chunk_text)
        txt = _window(txt, e, p.MAX_PAGE_CHARS) if txt else e
        umgebung = ""
        if f.prev_text:
            umgebung += f"\nVorkontext: …{norm_ws(f.prev_text)[-400:]}"
        if f.next_text:
            umgebung += f"\nNachkontext: {norm_ws(f.next_text)[:400]}…"
        teile.append(
            f"### Textstelle {i}\nDokument: {(f.document_name or '').split('/')[-1]}\n"
            f"Seite: {f.page}\nGliederung: {' > '.join(f.toc_path) if f.toc_path else '-'}\n"
            f"Zitat: {e[: p.MAX_EXCERPT_CHARS]}\nAbschnitt: {txt}{umgebung}"
        )
    return "\n\n".join(teile)
