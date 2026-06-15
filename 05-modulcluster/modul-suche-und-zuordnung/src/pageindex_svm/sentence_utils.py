"""
Sentence splitting, reconstruction, and chunk formatting utilities.

Pure functions with no LLM or external dependencies — safe to unit-test in isolation.
"""

import re
from typing import Any

# German abbreviations that should not be treated as sentence boundaries
_ABBREVIATIONS = [
    (r"z\.\s*B\.", "Z_BEISPIEL"),
    (r"u\.\s*a\.", "UNTER_ANDEREM"),
    (r"u\.\s*U\.", "UNTER_UMSTAENDEN"),
    (r"d\.\s*h\.", "DAS_HEISST"),
    (r"etc\.", "ETCETERA"),
    (r"Nr\.", "NUMMER"),
    (r"Abs\.", "ABSATZ"),
    (r"Art\.", "ARTIKEL"),
    (r"bzw\.", "BZW"),
    (r"ca\.", "CIRCA"),
    (r"ggf\.", "GGF"),
    (r"inkl\.", "INKL"),
    (r"max\.", "MAX"),
    (r"min\.", "MIN"),
    (r"usw\.", "USW"),
    (r"vgl\.", "VGL"),
    (r"gem\.", "GEM"),
    (r"i\.\s*S\.\s*d\.", "IM_SINNE_DES"),
    (r"i\.\s*V\.\s*m\.", "IN_VERBINDUNG_MIT"),
]


def split_into_sentences(text: str) -> list[str]:
    """Split text into sentences, handling German abbreviations and paragraph breaks."""
    if not text:
        return []

    # Protect abbreviations from being split
    protected = text
    for pattern, replacement in _ABBREVIATIONS:
        protected = re.sub(pattern, replacement, protected, flags=re.IGNORECASE)

    # Split on sentence boundaries (.!? followed by uppercase) or paragraph breaks
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])|(?:\n\s*\n)+", protected)

    # Restore abbreviations and clean up
    result = []
    for raw in sentences:
        cleaned = raw.strip()
        if not cleaned:
            continue
        for pattern, replacement in _ABBREVIATIONS:
            cleaned = cleaned.replace(replacement, pattern.replace(r"\s*", " ").replace("\\", ""))
        result.append(cleaned)

    return result


def format_chunks_with_sentences(
    chunks: list[dict[str, Any]],
) -> tuple[str, dict[str, list[str]]]:
    """Format chunks with numbered sentences for the Stage 2 LLM prompt."""
    formatted_parts = []
    sentence_maps: dict[str, list[str]] = {}

    for chunk in chunks:
        node_id = chunk["node_id"]
        text = chunk["text"]

        sentences = split_into_sentences(text)
        sentence_maps[node_id] = sentences
        numbered = "\n".join(f"[{i}] {s}" for i, s in enumerate(sentences))

        formatted_parts.append(
            f"--- ABSCHNITT (Node ID: {node_id}) ---\n"
            f"Titel: {chunk['title']}\n"
            f"Anzahl Sätze: {len(sentences)}\n\n"
            f"{numbered}\n"
        )

    return "\n".join(formatted_parts), sentence_maps


def reconstruct_from_indices(sentences: list[str], indices: list[int]) -> str:
    """Rebuild text from selected sentence indices, marking gaps with (...)."""
    if not sentences:
        return ""
    if not indices:
        return "(...)"

    valid_indices = sorted([i for i in indices if 0 <= i < len(sentences)])
    if not valid_indices:
        return "(...)"

    result_parts = []
    prev_idx = -1

    if valid_indices[0] > 0:
        result_parts.append("(...)")

    for idx in valid_indices:
        if prev_idx >= 0 and idx > prev_idx + 1:
            result_parts.append("(...)")
        result_parts.append(sentences[idx])
        prev_idx = idx

    if valid_indices[-1] < len(sentences) - 1:
        result_parts.append("(...)")

    return " ".join(result_parts)
