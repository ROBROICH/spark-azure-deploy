from typing import Any

from prompt_injection.prompt_defense import sanitize_and_wrap_external_data, sanitize_external_data

from src.config import CONFIG
from src.tbm_db_research.models import RechtsbegriffEintrag
from src.tbm_db_research.prompts import SYNTHESIS_PROMPT


def _format_dke_context(
    dke_results: list[dict[str, Any]],
    chars_per_chunk: int,
) -> str:
    """Format Drucksachen/Begruendungen chunks into a numbered context block for LLM input."""
    if not dke_results:
        return "Keine Begruendungen gefunden."
    sections = []
    for i, item in enumerate(dke_results, 1):
        title = item.get("section_title") or item.get("titel") or f"Begruendung {i}"
        text = item.get("chunk_text") or item.get("section_text") or ""
        dok_nr = item.get("dokumentnummer", "")
        datum = item.get("datum", "")
        header = f"[{i}] {title}"
        if dok_nr:
            header += f" (Drucks. {dok_nr}"
            if datum:
                header += f", {datum}"
            header += ")"
        sections.append(f"{header}\n{text[:chars_per_chunk]}")
    return "\n\n".join(sections)


def _format_urteile_context(
    ut_results: list[dict[str, Any]],
    max_unique_cases: int,
    chars_per_case: int,
) -> str:
    """Deduplicate Urteil chunks by Aktenzeichen and format up to max_unique_cases for LLM input."""
    if not ut_results:
        return "Keine Urteile gefunden."

    seen_akz: dict[str, list[str]] = {}
    meta: dict[str, dict[str, str]] = {}
    for item in ut_results:
        akz = item.get("aktenzeichen") or item.get("doc_id") or "unbekannt"
        text = item.get("text") or ""
        if akz not in seen_akz:
            seen_akz[akz] = []
            meta[akz] = {
                "gericht": item.get("gericht", ""),
                "datum": item.get("datum", ""),
            }
        seen_akz[akz].append(text)

    sections = []
    for i, (akz, chunks) in enumerate(seen_akz.items(), 1):
        if i > max_unique_cases:
            break
        gericht = meta[akz].get("gericht", "")
        datum = meta[akz].get("datum", "")
        header = f"[{i}] {akz}"
        if gericht or datum:
            header += f" ({gericht}, {datum})"
        combined_text = " [...] ".join(chunks)
        sections.append(f"{header}\n{combined_text[:chars_per_case]}")
    return "\n\n".join(sections)


def _format_rechtsbegriffe(begriffe: list[RechtsbegriffEintrag]) -> str:
    """Render Rechtsbegriffe as a bullet list, distinguishing bestimmte from unbestimmte terms."""
    if not begriffe:
        return "Keine Rechtsbegriffe."
    parts = []
    for b in begriffe:
        if b.typ == "bestimmt":
            def_lines = []
            for d in b.definitionen:
                src = d.source
                if src:
                    ref = f"{src.get('jurabk', '')} § {src.get('paragraph_nr', '')}".strip()
                    def_lines.append(f"{d.text} (Def. gem. {ref})")
                else:
                    def_lines.append(d.text)
            defs = "; ".join(def_lines)
            parts.append(f"- {b.begriff} (bestimmter Rechtsbegriff): {defs}")
        else:
            vorschlaege = "; ".join(b.auslegungsvorschlaege)
            if vorschlaege:
                parts.append(f"- {b.begriff} (unbestimmter Rechtsbegriff): {vorschlaege}")
            else:
                parts.append(f"- {b.begriff} (unbestimmter Rechtsbegriff)")
    return "\n".join(parts)


def build_synthesis_prompt(
    jurabk: str,
    paragraph_nr: str,
    absatz_nr: str,
    satz_nr: str,
    satz_text: str,
    tatbestandsmerkmale: list[str],
    prueffragen: list[str],
    rechtsbegriffe: list[RechtsbegriffEintrag],
    dke_results: list[dict[str, Any]],
    ut_results: list[dict[str, Any]],
) -> str:
    """Assemble the full LLM prompt for synthesizing a Pruefungsleitfaden from law DB results."""
    norm_name = f"{jurabk} § {paragraph_nr}"
    satz_ref = f"Absatz {absatz_nr}, Satz {satz_nr}"

    prueffragen_text = "\n".join(f"  {i}. {sanitize_external_data(pf)}" for i, pf in enumerate(prueffragen, 1))
    tbm_text = "\n".join(f"  - {sanitize_external_data(tbm)}" for tbm in tatbestandsmerkmale)
    # Wrap external DB/document data with sanitization
    satz_text_wrapped = sanitize_and_wrap_external_data(satz_text)
    rb_text = sanitize_and_wrap_external_data(_format_rechtsbegriffe(rechtsbegriffe))
    dke_text = sanitize_and_wrap_external_data(_format_dke_context(dke_results, CONFIG.DB_RESEARCH.DKE_CHARS_PER_CHUNK))
    ut_text = sanitize_and_wrap_external_data(
        _format_urteile_context(
            ut_results, CONFIG.DB_RESEARCH.UT_MAX_UNIQUE_CASES, CONFIG.DB_RESEARCH.UT_CHARS_PER_CASE
        )
    )

    return SYNTHESIS_PROMPT.format(
        norm_name=norm_name,
        satz_ref=satz_ref,
        satz_text=satz_text_wrapped,
        tbm_text=tbm_text,
        prueffragen_text=prueffragen_text,
        rb_text=rb_text,
        dke_text=dke_text,
        ut_text=ut_text,
    )
