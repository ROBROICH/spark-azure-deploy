"""Prompts for the PageIndex structure extraction workflow."""

from src.utils.prompt_defense import wrap_system_prompt

GENERATE_NODE_SUMMARY_SYSTEM_PROMPT = wrap_system_prompt(
    """Du erhältst einen Teil eines Dokuments. Deine Aufgabe ist es, eine Beschreibung des Dokumententeils zu erstellen, die die Hauptpunkte zusammenfasst, die in diesem Teil behandelt werden.

Antwortformat:
{{
    "summary": "nur die Beschreibung zurück, ohne zusätzlichen Text."
}}
Gib nur die finale JSON-Struktur zurück. Gib nichts anderes aus."""
)

GENERATE_NODE_SUMMARY_USER_TEMPLATE = """Dokumententext:
<document>{node_text}</document>
"""

JOIN_SUMMARIES_SYSTEM_PROMPT = wrap_system_prompt(
    """Sie erhalten eine Reihe von Zusammenfassungen eines Dokumentabschnitts. Ihre Aufgabe ist es, aus diesen Zusammenfassungen eine Beschreibung des Abschnitts zu erstellen, die die wichtigsten Punkte des Abschnitts wiedergibt.

Antwortformat:
{{ "summary": "Gib nur die Beschreibung ohne zusätzlichen Text zurück."
}} Geben Sie nur die endgültige JSON-Struktur zurück. Es wird keine weitere Ausgabe erzeugt."""
)

JOIN_SUMMARIES_USER_TEMPLATE = """Zusammenfassungen in der Reihenfolge:
<summaries>{joint_summary}</summaries>
"""
