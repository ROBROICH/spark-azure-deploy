"""Utilities for resolving Verweise (legal references)."""

import re
from typing import Any, Literal

from rapidfuzz import fuzz, process
from temporal.workflows.rechtsmethodik.types import ExplicitVerweiseInfo, TechnischeNorm, Untergliederung
from temporalio import workflow

from src.activities.law_api_calls import (
    FetchAbsaetzeInput,
    FetchNormInput,
    fetch_absaetze,
    fetch_document_by_search_term,
    fetch_documents,
    fetch_norm,
    tn_table_get_by_dokument,
)
from src.env import ENV
from src.log.logger import Logger
from src.workflows.tbm_workflow.tbm_types import VerweisWorkflowInput
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve_data_format import Verweis, VerweisBlockExplizit

LAW_DB = ENV.LAW_DATABASE
logger = Logger("Verweis Utils")


# ── helpers ──────────────────────────────────────────────────────────────────


def _is_empty(value: Any) -> bool:
    return value is None or value == []


_MUTUALLY_EXCLUSIVE_FIELDS = ("gesetz", "verordnung", "technische_norm", "richtlinie", "artikel", "anhang")


def _has_conflicting_sources(explizit: Verweis) -> bool:
    """Return True if 2 or more mutually exclusive source fields are set."""
    count = sum(1 for f in _MUTUALLY_EXCLUSIVE_FIELDS if getattr(explizit, f))
    return count >= 2  # noqa: PLR2004


def _is_trivial_self_reference(explizit: Verweis, gesetz: str, paragraph_nr: str) -> bool:
    """Return True if the reference adds no information beyond what we already know."""
    gesetz_match = explizit.gesetz == gesetz
    paragraph_match = explizit.paragraph_nr == paragraph_nr

    fields = explizit.model_dump()
    all_none = all(_is_empty(v) for v in fields.values())
    only_same_gesetz = gesetz_match and all(_is_empty(v) for k, v in fields.items() if k != "gesetz")
    only_same_gesetz_and_paragraph = (
        gesetz_match
        and paragraph_match
        and all(_is_empty(v) for k, v in fields.items() if k not in ("gesetz", "paragraph_nr"))
    )
    return all_none or only_same_gesetz or only_same_gesetz_and_paragraph


async def _resolve_technische_norm(raw_id: str) -> TechnischeNorm:
    """Resolve a reference to a technische Norm via the TN table."""
    norm_entry = await tn_table_get_by_dokument(raw_id)
    if norm_entry is None:
        return TechnischeNorm(id=raw_id, kurzbeschreibung="Technische Norm in Datenbank nicht gefunden")
    if not (norm_entry.kurzbeschreibung or "").strip():
        return TechnischeNorm(id=raw_id, kurzbeschreibung="Dokument gefunden, aber Kurzbeschreibung fehlt in der DB")
    return TechnischeNorm(id=raw_id, kurzbeschreibung=norm_entry.kurzbeschreibung)


def _fill_missing_absatz_satz(explizit: Verweis, input: VerweisWorkflowInput) -> tuple[str | None, str | None]:
    """Return (absatz_nr, satz_nr) with missing values filled from input for internal refs."""
    absatz_nr = explizit.absatz_nr
    satz_nr = explizit.satz_nr
    if not absatz_nr:
        absatz_nr = input.absatz_nr
        if not satz_nr:
            satz_nr = input.satz_nr
    return absatz_nr, satz_nr


def _classify_verweis_typ(explizit: Verweis, input: VerweisWorkflowInput) -> Literal["intern", "extern"]:
    """Determine whether a Verweis is internal or external."""
    gesetz_match = explizit.gesetz == input.gesetz
    paragraph_match = explizit.paragraph_nr == input.paragraph_nr
    return "intern" if (gesetz_match and paragraph_match) else "extern"


def _build_explicit_verweis_info(
    explizit: Verweis,
    input: VerweisWorkflowInput,
    technische_norm_resolved: TechnischeNorm | None,
) -> ExplicitVerweiseInfo:
    """Build an ExplicitVerweiseInfo from a Verweis model with classification and normalization."""
    verweis_typ = _classify_verweis_typ(explizit, input)

    absatz_nr = explizit.absatz_nr
    satz_nr = explizit.satz_nr
    if verweis_typ == "intern":
        absatz_nr, satz_nr = _fill_missing_absatz_satz(explizit, input)

    return ExplicitVerweiseInfo(
        gesetz=explizit.gesetz,
        paragraph_nr=explizit.paragraph_nr,
        absatz_nr=absatz_nr,
        satz_nr=satz_nr,
        untergliederung=[u.model_dump() for u in explizit.untergliederung] if explizit.untergliederung else None,
        anhang=explizit.anhang,
        artikel=explizit.artikel,
        richtlinie=explizit.richtlinie,
        verordnung=explizit.verordnung,
        technische_norm=technische_norm_resolved,
        verweis_typ=verweis_typ,
        kontext=None,
    )


# ── postprocess ───────────────────────────────────────────────────────────────


async def postprocess_explizite_verweise(
    all_verweise: list[VerweisBlockExplizit],
    verweis_workflow_input: VerweisWorkflowInput,
) -> tuple[list[list[ExplicitVerweiseInfo]], list[ExplicitVerweiseInfo]]:
    """Filter, classify, and normalize raw LLM-extracted explicit legal references."""
    ve_a_tbms: list[list[ExplicitVerweiseInfo]] = [
        [] for _ in range(len(verweis_workflow_input.atomare_tatbestandsmerkmale))
    ]
    ve_rf: list[ExplicitVerweiseInfo] = []

    for verweis in all_verweise:
        explizit = verweis.explizit

        if _has_conflicting_sources(explizit):
            continue

        if _is_trivial_self_reference(explizit, verweis_workflow_input.gesetz, verweis_workflow_input.paragraph_nr):
            continue

        technische_norm_resolved: TechnischeNorm | None = None
        if explizit.technische_norm:
            technische_norm_resolved = await _resolve_technische_norm(explizit.technische_norm)

        info = _build_explicit_verweis_info(explizit, verweis_workflow_input, technische_norm_resolved)

        vid = verweis.id
        parts = vid.split("_")
        if len(parts) != 2 or not parts[1].isdigit():  # noqa: PLR2004
            logger.warning(f"Skipping verweis with malformed id: '{vid}'")
            continue

        idx = int(parts[1])
        if vid.startswith("tbm_"):
            if idx >= len(ve_a_tbms):
                logger.warning(f"Skipping verweis '{vid}': index {idx} out of range")
                continue
            ve_a_tbms[idx].append(info)
        elif vid.startswith("rf_"):
            ve_rf.append(info)

    return ve_a_tbms, ve_rf


# ── context fetching ──────────────────────────────────────────────────────────


def _build_markers(untergliederung: list[Untergliederung] | None) -> list[str]:
    """Extract Untergliederung values as a flat list of marker strings."""
    if not untergliederung:
        return []
    return [u.wert for u in untergliederung]


def _is_sublist(sub: list[str], lst: list[str]) -> bool:
    """Return True if sub appears as a contiguous subsequence within lst."""
    if not lst:
        return False
    n = len(sub)
    return any(lst[i : i + n] == sub for i in range(len(lst) - n + 1))


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation, and collapse whitespace for fuzzy matching."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _best_law_match(standalone_law: str, law_list: list[str], threshold: float = 95.0) -> str | None:
    """Return the best fuzzy-match law name, or None if below confidence threshold."""
    normalized_laws = [_normalize(law) for law in law_list]
    normalized_query = _normalize(standalone_law)

    result = process.extractOne(normalized_query, normalized_laws, scorer=fuzz.token_set_ratio)
    if result is None:
        return None

    _, score, idx = result
    if score < threshold:
        return None

    return law_list[idx]


async def _resolve_jurabk(search_term: str, fuzzy: bool = False) -> str | None:
    """Resolve a jurabk reference to its full document metadata."""
    resp = await fetch_document_by_search_term(search_term)
    if resp:
        return resp[0]["jurabk"]

    if not fuzzy:
        return None

    documents = await fetch_documents()
    list_of_kurzue = [doc["kurzue"] for doc in documents if doc["kurzue"]]

    match = _best_law_match(search_term, list_of_kurzue)
    if match is None:
        return None

    resp = await fetch_document_by_search_term(match)
    if not resp:
        return None
    return resp[0]["jurabk"]


def _parse_int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip().isdigit():
        return int(value)
    return None


def _extract_kontext_from_saetze(
    saetze: list[dict[str, Any]],
    satz_nr: int | None,
    markers: list[str],
) -> list[str]:
    """Filter Sätze by optional satz_nr and/or markers."""
    if satz_nr and not markers:
        return [s["satz_text"] for s in saetze if s["satz_nr"] == satz_nr]

    return [
        s["satz_text"]
        for s in saetze
        if (not satz_nr or s["satz_nr"] == satz_nr) and _is_sublist(markers, s["markers"])
    ]


async def _fetch_verweis_context(verweis: ExplicitVerweiseInfo) -> ExplicitVerweiseInfo:  # noqa: PLR0911
    """Fetch context for a single verweis, returning an updated copy with kontext populated."""
    gesetz = verweis.gesetz
    verordnung = verweis.verordnung
    paragraph_nr = verweis.paragraph_nr
    absatz_nr = verweis.absatz_nr
    satz_nr = _parse_int_or_none(verweis.satz_nr)
    markers = _build_markers(verweis.untergliederung)

    # Skip invalid verweise
    if not (bool(gesetz) ^ bool(verordnung)) or not paragraph_nr:
        return verweis

    search_term = gesetz or verordnung
    assert search_term is not None
    jurabk = await _resolve_jurabk(search_term)
    if jurabk is None:
        return verweis

    try:
        # Paragraph only (no absatz/satz/markers)
        if not (absatz_nr or satz_nr or markers):
            resp = await fetch_norm(FetchNormInput(jurabk=jurabk, paragraph_nr=paragraph_nr))
            if not resp:
                return verweis
            return verweis.model_copy(update={"kontext": [resp[0]["paragraph_text"]]})

        # Fetch absätze
        resp = await fetch_absaetze(FetchAbsaetzeInput(jurabk=jurabk, paragraph_nr=paragraph_nr, absatz_nr=absatz_nr))
    except Exception as e:
        logger.warning(f"Failed to fetch context for verweis {gesetz or verordnung} §{paragraph_nr}: {e}")
        return verweis

    if not resp:
        return verweis

    absatz_data = resp[0]

    if not satz_nr and not markers:
        kontext = [absatz_data["absatz_text"]]
    else:
        kontext = _extract_kontext_from_saetze(absatz_data["saetze"], satz_nr, markers)

    return verweis.model_copy(update={"kontext": kontext})


async def fetch_context_for_verweise(
    ve_a_tbms: list[list[ExplicitVerweiseInfo]],
    ve_rf: list[ExplicitVerweiseInfo],
) -> tuple[list[list[ExplicitVerweiseInfo]], list[ExplicitVerweiseInfo]]:
    """Fetch context for all explicit references in parallel."""
    ve_a_tbms_tasks = [
        workflow.asyncio.gather(*(_fetch_verweis_context(v) for v in tbm_list)) for tbm_list in ve_a_tbms
    ]
    ve_a_tbms_w_context = await workflow.asyncio.gather(*ve_a_tbms_tasks)
    ve_rf_w_context = await workflow.asyncio.gather(*(_fetch_verweis_context(v) for v in ve_rf))

    # Filter out references where context could not be resolved (e.g. hallucinated norms)
    ve_a_tbms_filtered = [[v for v in tbm_list if v.kontext] for tbm_list in ve_a_tbms_w_context]
    ve_rf_filtered = [v for v in ve_rf_w_context if v.kontext]

    return ve_a_tbms_filtered, ve_rf_filtered


VI_FILTER_KEYWORDS = [
    "vorschrift",
    "recht",
    "regelunganforderung",
    "regel",
    "anleitung",
    "bestimmung",
    "grundsätze",
]


def filter_vi_output(implizite_verweise: list[str]) -> list[str]:
    """Filter the list of verweise to include only those that contain any of the specified keywords."""
    return [v for v in implizite_verweise if any(keyword in v.lower() for keyword in VI_FILTER_KEYWORDS)]
