"""Functions for resolving required documents for TBMs via rule-based lookup matching."""

import re
from typing import Any

from src.tbm_matching.rule_based_matching.lookup_data import MatchingRule


def find_lookup_documents_for_tbms(
    tbm_list: list[dict[str, Any]],
    result_json: dict[str, Any],
    lookup_rules: list[MatchingRule],
) -> list[list[dict[str, Any]]]:
    """Resolve required documents for every TBM by matching its legal position against lookup_rules.

    Returns one inner list per TBM, preserving order; each inner list may be empty.
    """
    resolved_documents_all = []

    for tbm in tbm_list:
        law = str(tbm.get("_jurabk", "")) or ""
        paragraph = str(tbm.get("_paragraph_nr", "")) or ""
        absatz = str(tbm.get("_absatz_nr", "")) or None
        satz = str(tbm.get("_satz_nr", "")) or None

        required_types = get_required_document_types_for_position(
            law=law, paragraph=paragraph, absatz=absatz, satz=satz, lookup_rules=lookup_rules
        )
        resolved_docs = get_documents_by_type(result_json, required_types)
        resolved_documents_all.append(resolved_docs)

    return resolved_documents_all


def get_required_document_types_for_position(
    law: str,
    paragraph: str,
    absatz: str | None,
    satz: str | None,
    lookup_rules: list[MatchingRule],
) -> list[str]:
    """All matching rules contribute — not just the first match."""

    matches = set()

    for rule in lookup_rules:
        if rule_matches(rule, paragraph, law, absatz, satz):
            matches.update(rule.documents)

    return list(matches)


def rule_matches(
    rule: MatchingRule,
    paragraph: str,
    law: str,
    absatz: str | None = None,
    satz: str | None = None,
) -> bool:
    """Each ``None`` field in the rule acts as a wildcard; paragraph may be a single value or a ``(start, end)`` range tuple."""

    # Law
    if rule.law is not None and str(law).strip() != str(rule.law).strip():
        return False

    # Paragraph
    if rule.number is not None:
        if isinstance(rule.number, tuple):
            # Range
            start, end = rule.number
            if not number_in_range(str(paragraph), str(start), str(end)):
                return False
        # Single
        elif str(paragraph).strip() != str(rule.number).strip():
            return False

    # Absatz
    if rule.absatz is not None and absatz is not None and str(rule.absatz).strip() != str(absatz).strip():
        return False

    # Satz
    return rule.satz is None or satz is None or str(rule.satz).strip() == str(satz).strip()


def get_documents_by_type(result_json: dict[str, Any], required_types: list[str]) -> list[dict[str, Any]]:
    """Extracts assigned documents from ``matched_document_types``; deduplicates by ``document_id``."""
    matched_documents: dict[str, dict[str, Any]] = {}

    for entry in result_json.get("matched_document_types", []):
        doc_type_name = entry.get("required_document_type", {}).get("document_type_name")
        if doc_type_name not in required_types:
            continue
        for doc in entry.get("assigned_documents", []):
            document_id = doc.get("document_id")
            document_name = doc.get("document_name")
            if not document_name or document_id in matched_documents:
                continue
            matched_documents[document_id] = {
                "title": document_name,
                "document_id": document_id,
                "project_id": doc.get("project_id"),
            }

    return list(matched_documents.values())


def normalize_number(value: str) -> tuple[int, str]:
    """Parse a paragraph number string like ``'30a'`` into a sortable ``(int, suffix)`` tuple."""
    match = re.match(r"(\d+)([a-zA-Z]*)", value)
    if not match:
        raise ValueError(f"Invalid number format: {value}")
    return int(match.group(1)), match.group(2)


def number_in_range(value: str, start: str, end: str) -> bool:
    """Inclusive range check using tuple comparison, so ``'30a'`` sorts after ``'30'`` and before ``'31'``."""
    value_tuple = normalize_number(value)
    start_tuple = normalize_number(start)
    end_tuple = normalize_number(end)
    return start_tuple <= value_tuple <= end_tuple
