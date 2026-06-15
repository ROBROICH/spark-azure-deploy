"""Query building helpers for TBM matching.

Pure computation — no I/O, no HTTP calls.
"""

from typing import Any


def extract_definition(tbm: dict[str, Any]) -> str | None:
    """Prefers the definition referenced by ``selected_definition`` UUID; falls back to the first definition. Only the first ``bestimmter Rechtsbegriff`` is considered."""
    definition_text = None
    rechtsbegriffe = tbm.get("rechtsbegriffe") or {}

    bestimmte_rechtsbegriffe = rechtsbegriffe.get("bestimmte_rechtsbegriffe") or []
    for begriff in bestimmte_rechtsbegriffe:
        selected_def_uuid = begriff.get("selected_definition")
        definitions = begriff.get("definitions", [])

        if not definitions:
            continue

        if selected_def_uuid:
            match = next(
                (d for d in definitions if d.get("uuid") == selected_def_uuid),
                None,
            )
            if match:
                definition_text = match.get("definition")
                break
            definition_text = definitions[0].get("definition")
            break
        definition_text = definitions[0].get("definition")
        break
    return definition_text


def build_queries(tbm_list: list[dict[str, Any]]) -> list[str]:
    """Enriches each Prüffrage with the extracted definition and ``_absatz_text`` (if present) before returning queries in the same order."""
    queries: list[str] = []
    for tbm in tbm_list:
        prueffrage_query = tbm.get("prueffrage", "") or ""
        definition_text = extract_definition(tbm)
        if definition_text:
            prueffrage_query += " " + definition_text
        absatz_text = tbm.get("_absatz_text", "") or ""
        if absatz_text:
            prueffrage_query += " " + absatz_text
        queries.append(prueffrage_query)
    return queries
