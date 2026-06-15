"""
Pure data-transformation helpers for SatzOrchestratorWorkflow.

No I/O, no Temporal SDK calls — safe to import and unit-test in isolation.
"""

from typing import Any

from temporal.workflows.modul_suche_und_zuordnung.types import (
    BestimmterRechtsbegriff,
    NormData,
    Satz,
    UnbestimmterRechtsbegriff,
)

from src.tbm_db_research.models import RechtsbegriffDefinition, RechtsbegriffEintrag


def _find_satz_context(data: NormData, satz_id: str) -> tuple[str, str, Satz]:
    """Locate a Satz by satz_id and return its absatz/satz numbering context."""
    for absatz in data.absaetze:
        absatz_nr = str(absatz.absatz_nr)
        for satz in absatz.saetze:
            if satz.id == satz_id:
                return absatz_nr, str(satz.satz_nr), satz
    raise ValueError(f"Satz not found in data: satz_id={satz_id}")


def _convert_bestimmt(begriff: BestimmterRechtsbegriff) -> RechtsbegriffEintrag:
    """Maps a BestimmterRechtsbegriff to a RechtsbegriffEintrag, filtering out definitions without text."""
    return RechtsbegriffEintrag(
        begriff=begriff.begriff,
        typ="bestimmt",
        definitionen=[
            RechtsbegriffDefinition(
                text=d.definition,
                source=d.source.model_dump() if d.source else None,
            )
            for d in begriff.definitions
            if d.definition
        ],
    )


def _convert_unbestimmt(begriff: UnbestimmterRechtsbegriff) -> RechtsbegriffEintrag:
    """Filters out entries where auslegungvorschlag is falsy or the sentinel string "dummy text"."""
    return RechtsbegriffEintrag(
        begriff=begriff.begriff,
        typ="unbestimmt",
        auslegungsvorschlaege=[
            a.auslegungvorschlag
            for a in begriff.auslegungsvorschlaege
            if a.auslegungvorschlag and a.auslegungvorschlag != "dummy text"
        ],
    )


def _collect_rechtsbegriffe(satz: Satz) -> list[RechtsbegriffEintrag]:
    """Aggregate and deduplicate Rechtsbegriffe across all atomaren TBMs of a Satz."""
    rechtsbegriffe: list[RechtsbegriffEintrag] = []

    for tbm in satz.atomare_tatbestandsmerkmale:
        rb = tbm.rechtsbegriffe
        if not rb:
            continue

        for begriff in rb.bestimmte_rechtsbegriffe:
            if begriff.begriff:
                rechtsbegriffe.append(_convert_bestimmt(begriff))

        for begriff in rb.unbestimmte_rechtsbegriffe:
            if begriff.begriff:
                rechtsbegriffe.append(_convert_unbestimmt(begriff))

    # Deduplicate by begriff name, keeping first occurrence
    seen: set[str] = set()
    unique: list[RechtsbegriffEintrag] = []
    for rb_item in rechtsbegriffe:
        if rb_item.begriff not in seen:
            seen.add(rb_item.begriff)
            unique.append(rb_item)
    return unique


def extract_satz_data(data: NormData, satz_id: str) -> dict[str, Any]:
    """Returns a plain dict aggregating prueffragen and rechtsbegriffe across all atomaren TBMs."""
    absatz_nr, satz_nr, satz = _find_satz_context(data, satz_id)

    prueffragen = [tbm.prueffrage for tbm in satz.atomare_tatbestandsmerkmale if tbm.prueffrage]

    return {
        "jurabk": data.jurabk,
        "paragraph_nr": str(data.paragraph_nr),
        "absatz_nr": absatz_nr,
        "satz_nr": satz_nr,
        "satz_text": satz.satz_text,
        "tatbestandsmerkmale": satz.tatbestandsmerkmale,
        "prueffragen": prueffragen,
        "rechtsbegriffe": _collect_rechtsbegriffe(satz),
    }
