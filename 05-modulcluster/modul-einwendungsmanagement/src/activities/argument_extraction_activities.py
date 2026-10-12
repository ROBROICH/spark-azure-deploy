"""Temporal Activities for legal argument extraction and text alignment.

Provides Temporal activities for extracting structured arguments from text and
performing fuzzy string matching to locate specific character-level spans within
source documents.
"""

import unicodedata

from rapidfuzz import fuzz
from temporal.contracts import TextSpan
from temporalio import activity

from src.schemas.argument_extraction_schemas import (
    SpanPositionsActivityParams,
)


@activity.defn
def span_positions(params: SpanPositionsActivityParams) -> list[TextSpan]:
    """Resolve multiple text snippets to character spans in one activity call."""
    results: list[TextSpan] = []

    for item in params.items:
        span_norm = unicodedata.normalize("NFC", item.span_text).lower()
        full_norm = unicodedata.normalize("NFC", item.full_text).lower()

        # 1. Exact Match Check
        start = full_norm.find(span_norm)
        if start != -1:
            results.append(TextSpan(start_idx=start, end_idx=start + len(span_norm)))
            continue

        # 2. Fuzzy Match Fallback
        alignment = fuzz.partial_ratio_alignment(full_norm, span_norm)

        if alignment and (alignment.score / 100.0) >= params.threshold:
            results.append(TextSpan(start_idx=alignment.src_start, end_idx=alignment.src_end))
        else:
            results.append(TextSpan(start_idx=-1, end_idx=-1))

    return results
