import re
from typing import Protocol

from rapidfuzz import fuzz

from src.activities.law_api_calls import DefinitionsByJurabkTitelOutput, LegaldefinitionOutput


def format_legal_source(
    jurabk: str,
    paragraph_nr: str,
    absatz_nr: str | None,
    satz_nr: str | None,
    markers: list[str] | None,
) -> str:
    """Format a legal source reference string from its components."""
    result = f"§ {paragraph_nr}"

    if absatz_nr:
        result += f" Absatz {absatz_nr}"

    if satz_nr or markers:
        result += " " + format_saetze(satz_nr, markers)

    result += f" {jurabk}"

    return result


def _format_marker(marker: str) -> str:
    """Return the formatted label for a single marker value."""
    marker = marker.strip()
    if re.fullmatch(r"\d+(\.\d+)?", marker):
        return f"Nummer {marker}"
    if re.fullmatch(r"[a-zA-Z]", marker):
        return f"Buchstabe {marker}"
    if re.fullmatch(r"[a-zA-Z]{2}", marker):
        return f"Doppelbuchstabe {marker}"
    return ""


def format_saetze(satz_nr: str | None, markers: list[str] | None) -> str:
    """Format a Satz/marker reference fragment for use in a legal source string."""
    result = ""
    if satz_nr:
        result += f"Satz {satz_nr} "
    if markers:
        result += " ".join(filter(None, (_format_marker(m) for m in markers)))
    return result.strip()


class HasBegriff(Protocol):
    """Protocol requiring a `begriff` string attribute for fuzzy matching."""

    begriff: str


def assign_begriffe_to_a_tbms[BegriffType: HasBegriff](
    a_tbms: list[str],
    begriffe: list[BegriffType],
    threshold: float,
) -> list[list[BegriffType]]:
    """Assign each Begriff to the atomic TBMs it fuzzy-matches above the threshold."""
    results: list[list[BegriffType]] = [[] for _ in a_tbms]

    a_tbms_lower = [a_tbm.lower() for a_tbm in a_tbms]

    for begriff in begriffe:
        for i, a_tbm_lower in enumerate(a_tbms_lower):
            score = fuzz.partial_ratio(begriff.begriff.lower(), a_tbm_lower)

            if score >= threshold:
                results[i].append(begriff)

    return results


def filter_rechtsbegriffe_by_assignment[BegriffType: HasBegriff](
    a_tbms: list[str],
    begriffe: list[BegriffType],
    threshold: float,
) -> list[BegriffType]:
    a_tbms_lower = [a_tbm.lower() for a_tbm in a_tbms]

    return [
        begriff
        for begriff in begriffe
        if any(fuzz.partial_ratio(begriff.begriff.lower(), a_tbm_lower) >= threshold for a_tbm_lower in a_tbms_lower)
    ]


def get_matching_legal_terms(
    candidates: list[str], definitions: DefinitionsByJurabkTitelOutput, threshold: float
) -> set[LegaldefinitionOutput]:
    matched_legal_terms: set[LegaldefinitionOutput] = set()

    for cand in candidates:
        for entry in definitions.definitions:
            score = fuzz.partial_ratio(entry.begriff.lower(), cand.lower())
            if score >= threshold:
                matched_legal_terms.add(entry)

    return matched_legal_terms
