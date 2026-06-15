"""Prompts for the Detail-Planner (batched SVM assignment to fixed chapters)."""

from __future__ import annotations

from textwrap import dedent

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt

from src.models.types import DetailedPlan, MicroSummary
from src.prompts.system import SYSTEM_PROMPT

DETAIL_PLANNER_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du ordnest Sachverhalts-Zusammenfassungen (SVMs) einer fixen Kapitelstruktur zu.

    === AUFGABE ===

    Du erhältst:
    1. Eine feste Kapitelstruktur mit Index, Titel, Ziel und den IDs bereits zugeordneter SVMs
    2. Eine Referenzliste mit den Kernaussagen aller bereits zugeordneten SVMs (jede ID nur einmal)
    3. Einen Batch neuer SVMs, die noch keinem Kapitel zugeordnet sind

    Entscheide pro SVM:
    - **Zuordnung**: Welches Kapitel passt inhaltlich am besten? Gib den `kapitel_index` an.
    - **Überspringen**: Ist die Information bereits durch existierende SVMs im Ziel-Kapitel abgedeckt? Dann `kapitel_index: null`.

    REGELN:
    - Ändere NICHT die Kapitelstruktur. Die Kapitel sind fix.
    - Jede SVM wird genau einmal bewertet: entweder zugeordnet oder übersprungen.
    - Ordne SVMs dem inhaltlich passendsten Kapitel zu.
    - Überspringe ein SVM, wenn die Kerninformation BEREITS durch vorhandene SVMs abgedeckt ist.

    ANTWORTFORMAT:
    Antworte ausschließlich mit einem JSON-Array:
    ```json
    [
      {"svm_id": "0042", "kapitel_index": 2},
      {"svm_id": "0043", "kapitel_index": null}
    ]
    ```
"""))


DETAIL_PLANNER_USER_PROMPT = dedent("""\
    NORM: {norm}
    TATBESTANDSMERKMAL: {satz_text}

    === KAPITELSTRUKTUR (fix) ===
    {kapitelstruktur}

    === REFERENZ: Bereits zugeordnete SVMs ===
    {referenz_svms}

    === NEUE SVMs (bitte zuordnen oder überspringen) ===
    {external_data_tag_open}
    {svms_text}
    {external_data_tag_close}""")


def _build_kapitelstruktur(
    plan: DetailedPlan,
    micros_by_id: dict[str, MicroSummary],
) -> tuple[str, str]:
    """Build chapter structure (compact) and a deduplicated SVM reference section.

    Returns (kapitelstruktur, referenz_svms).
    """
    chapter_lines: list[str] = []
    all_referenced_ids: set[str] = set()

    for idx, kapitel in enumerate(plan.kapitel):
        existing_ids = kapitel.svm_ids or []
        all_referenced_ids.update(existing_ids)

        if existing_ids:
            ids_str = ", ".join(existing_ids)
            chapter_lines.append(
                f"[{idx}] {kapitel.titel} — Ziel: {kapitel.ziel} — SVMs: {ids_str}"
            )
        else:
            chapter_lines.append(f"[{idx}] {kapitel.titel} — Ziel: {kapitel.ziel}")

    # Build deduplicated reference list (each kernaussage only once)
    ref_lines: list[str] = []
    for sid in sorted(all_referenced_ids):
        micro = micros_by_id.get(sid)
        if micro:
            ref_lines.append(f"[{sid}] {micro.kernaussage}")

    referenz_svms = "\n".join(ref_lines) if ref_lines else "(keine)"
    return "\n".join(chapter_lines), referenz_svms


def build_detail_planner_prompt(
    plan: DetailedPlan,
    micros_by_id: dict[str, MicroSummary],
    batch: list[MicroSummary],
    norm: str,
    satz_text: str,
) -> str:
    """Build the user prompt for one batch of the Detail-Planner."""
    kapitelstruktur, referenz_svms = _build_kapitelstruktur(plan, micros_by_id)
    svms_text = "\n".join(f"[{micro.svm_id}] {micro.kernaussage}" for micro in batch)

    return render_prompt_format(
        DETAIL_PLANNER_USER_PROMPT,
        norm=norm,
        satz_text=satz_text,
        kapitelstruktur=kapitelstruktur,
        referenz_svms=referenz_svms,
        svms_text=svms_text,
    )
