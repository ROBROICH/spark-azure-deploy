"""Prompt for the Micro-Builder (Stage 1)."""

from __future__ import annotations

from textwrap import dedent

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt

from src.models.types import MicroBuilderInput
from src.prompts.system import SYSTEM_PROMPT

MICRO_BUILDER_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du bist ein Extraktions-Assistent für juristische Fachgutachten.

    AUFGABE: Extrahiere für JEDEN Chunk die KERNAUSSAGE bezogen auf das TBM.

    Für JEDEN Chunk extrahiere:
    1. svm_id: Die 4-stellige ID aus [xxxx] (z.B. "0001") - NUR die Zahl!
    2. kernaussage: 2-3 Sätze mit KONKRETEN Fakten:
       - Was wurde festgestellt?
       - Welche Auswirkung/Relevanz für das TBM?
       - Konkrete Entitäten/Zahlen/Bezeichnungen nennen

    Antworte NUR mit einem JSON-Array:
    [
      {
        "svm_id": "0001",
        "kernaussage": "..."
      }
    ]"""))

MICRO_BUILDER_USER_PROMPT = dedent("""\
    TBM (zu prüfendes Tatbestandsmerkmal):
    {tbm}

    NORM:
    {norm}

    CHUNKS:
    {external_data_tag_open}
    {chunks_text}
    {external_data_tag_close}""")


def build_micro_builder_prompt(input: MicroBuilderInput, chunks_text: str) -> str:
    """Return the formatted user prompt for the micro builder."""
    return render_prompt_format(
        MICRO_BUILDER_USER_PROMPT,
        tbm=input.satz_text,
        norm=input.norm,
        chunks_text=chunks_text,
    )
