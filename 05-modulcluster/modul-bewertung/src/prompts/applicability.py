"""Prompt for the Applicability pre-check (Stage 1.5)."""

from __future__ import annotations

from textwrap import dedent

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt

from src.models.types import ApplicabilityInput, MicroSummary
from src.prompts.system import SYSTEM_PROMPT

APPLICABILITY_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du bist ein erfahrener Verwaltungsjurist. Deine Aufgabe ist ein schneller Vorfilter: Du entscheidest, ob eine nachfolgende rechtliche Bewertung eines Tatbestandsmerkmals (TBM) für den Beschluss sinnvoll ist.

    ## AUFGABE

    Dir liegen Sachverhaltsinformationen (Kernaussagen) zu einem Vorhaben und ein TBM vor.
    Entscheide auf Basis des Sachverhalts, ob das TBM in der nächsten Stufe rechtlich bewertet werden soll.

    Du führst KEINE rechtliche Bewertung durch. Du triffst nur eine Routing-Entscheidung.

    ## ENTSCHEIDUNGSLOGIK

    Prüfe in dieser Reihenfolge:

    ### 1. Offensichtlicher Ausschluss?
    Passen Sachverhalt und TBM offensichtlich nicht zusammen UND ist auch keine Begründung im Beschluss nötig?
    - Das Vorhaben fällt offensichtlich nicht in den Anwendungsbereich der Norm.
    - Eine rechtliche Auseinandersetzung mit dem TBM wäre für den Beschluss nicht erforderlich.
    → Nur wenn beides zutrifft: **überspringen**

    ### 2. Informationslücke?
    Enthält der Sachverhalt überhaupt Angaben, die sich inhaltlich auf das TBM beziehen?
    - Wird das Thema des TBM im Sachverhalt adressiert oder spezifiziert?
    - Gibt es konkrete Fakten, Daten oder Aussagen mit Bezug zum TBM?
    → Wenn NEIN (Thema wird nicht genannt oder es gibt zu wenige Informationen): **nicht_beurteilbar**

    ### 3. Sonst: Bewerten
    In allen anderen Fällen soll das TBM rechtlich bewertet werden.
    → **bewerten**

    ## LEITPRINZIP

    **bewerten** ist der Default. Wähle **überspringen** nur, wenn der Fall offensichtlich ist UND keine Begründung im Beschluss erforderlich ist. Im Zweifel immer **bewerten**.

    ## ANTWORTFORMAT

    Schreibe zuerst deinen Denkprozess, dann das finale JSON in einem ```json Block.
    Die Begründung wird bei **überspringen** und **nicht_beurteilbar** dem Sachberarbeiter angezeigt, daher sollte sie entsprechend präzise und hilfreich sein. Achte auf entsprechende Sprache. 

    Bei **bewerten**:
    ```json
    {
      "status": "bewerten",
      "begruendung_markdown": null,
      "kurzform": null
    }
    ```

    Bei **überspringen**:
    ```json
    {
      "status": "überspringen",
      "begruendung_markdown": "## Zusammenfassung \\n\\n[Kurze Begründung, warum Sachverhalt und TBM offensichtlich nicht zusammenpassen. Bezug auf Sachverhaltsinformationen mit SVM-Referenzen [xxxx].]",
      "kurzform": "[1-2 Sätze: Warum ist keine rechtliche Bewertung erforderlich?]"
    }
    ```

    Bei **nicht_beurteilbar**:
    ```json
    {
      "status": "nicht_beurteilbar",
      "begruendung_markdown": "## Zusammenfassung\\n\\n[Welche Informationen zum TBM im Sachverhalt fehlen.]",
      "kurzform": "[1-2 Sätze: Welche Informationen fehlen?]"
    }
    ```"""))

APPLICABILITY_USER_PROMPT = dedent("""\
    TATBESTANDSMERKMAL (TBM):
    {tbm}

    NORM: {norm}

    === VERFÜGBARE SACHVERHALTSINFORMATIONEN (Kernaussagen) ===
    {external_data_tag_open}
    {micros_text}
    {external_data_tag_close}""")


def build_applicability_prompt(input: ApplicabilityInput, micros: list[MicroSummary]) -> str:
    """Return the formatted user prompt for the applicability check."""
    micros_text = "\n".join(f"[{m.svm_id}] {m.kernaussage}" for m in micros)
    return render_prompt_format(
        APPLICABILITY_USER_PROMPT,
        tbm=input.satz_text,
        norm=input.norm,
        micros_text=micros_text,
    )
