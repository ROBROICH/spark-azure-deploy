"""Fuzzy and regex-based text matching for PII terms in PDF pages."""

import re

from rapidfuzz import fuzz

# Characters that constitute word boundaries (in addition to start/end of string)
_BOUNDARY_RE = re.compile(r"[\s\-/.,;:!?()\"'\[\]{}«»–—]")


def _is_word_boundary(text: str, pos: int, is_start: bool) -> bool:
    """Check whether a match position aligns with a word boundary in the original text.

    is_start selects the left boundary (True) or the right boundary (False).
    """
    if is_start:
        if pos == 0:
            return True
        return _BOUNDARY_RE.match(text[pos - 1]) is not None
    else:
        if pos >= len(text):
            return True
        return _BOUNDARY_RE.match(text[pos]) is not None


def fuzzy_search_pdf(text: str, search_terms: list[str], threshold: float = 0.95) -> set[str]:
    """Find fuzzy matches for search terms in full page text.

    Uses a sliding-window approach over normalized text to find the
    best-matching substring for each search term. threshold is a similarity
    ratio on a 0.0-1.0 scale.
    """
    fuzzy_matches: set[str] = set()
    index_map = _build_index_map(text)
    norm_text = re.sub(r"\s+", "", text).lower()
    score_cutoff = threshold * 100  # rapidfuzz uses 0-100 scale

    for term in search_terms:
        if len(term) <= 2:
            continue

        norm_term = re.sub(r"\s+", "", term).lower()
        term_len = len(norm_term)
        if term_len == 0:
            continue

        # Fast path: find all exact substring occurrences and keep those at word boundaries
        exact_pos = norm_text.find(norm_term)
        if exact_pos != -1:
            found_valid = False
            while exact_pos != -1:
                orig_start = index_map[exact_pos]
                orig_end = index_map[exact_pos + term_len - 1] + 1
                if _is_word_boundary(text, orig_start, is_start=True) and _is_word_boundary(
                    text, orig_end, is_start=False
                ):
                    fuzzy_matches.add(text[orig_start:orig_end])
                    found_valid = True
                exact_pos = norm_text.find(norm_term, exact_pos + 1)
            if found_valid:
                continue

        # Fuzzy path: use partial_ratio_alignment (C-optimized sliding window)
        alignment = fuzz.partial_ratio_alignment(norm_term, norm_text, score_cutoff=score_cutoff)
        if alignment is None:
            continue

        dest_start = alignment.dest_start
        dest_end = alignment.dest_end
        if dest_end > len(index_map):
            continue

        orig_start = index_map[dest_start]
        orig_end = index_map[dest_end - 1] + 1
        if not (
            _is_word_boundary(text, orig_start, is_start=True)
            and _is_word_boundary(text, orig_end, is_start=False)
        ):
            continue

        best_match = text[orig_start:orig_end]
        # Only accept fuzzy matches > 3 chars; shorter terms are too prone to false positives
        # (they are still caught by the exact-match fast path above)
        if len(best_match) > 3:
            fuzzy_matches.add(best_match)

    return fuzzy_matches


def _build_index_map(original_text: str) -> list[int]:
    """Map each non-whitespace position in the normalized text back to its original index."""
    return [idx for idx, char in enumerate(original_text) if not char.isspace()]

