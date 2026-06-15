"""Prompt templates for PII extraction from German-language planning documents."""

import json
from pathlib import Path
from typing import Any

from prompt_injection.prompt_defense import wrap_system_prompt

_PROMPT_DIR = Path(__file__).resolve().parent
_PII_INCLUDE_CONFIG_PATH = _PROMPT_DIR / "pii_config.json"
_PII_EXCLUDE_CONFIG_PATH = _PROMPT_DIR / "pii_config_exclusions.json"


def _load_pii_config(path: Path) -> list[dict[str, Any]]:
    """Load PII prompt config items from JSON."""
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items", [])
    if not isinstance(items, list):
        raise ValueError(f"Invalid PII config format in {path}: 'items' must be a list")

    return items


def _format_examples(examples: list[str] | None) -> str:
    """Format optional examples for prompt text."""
    if not examples:
        return ""

    formatted = "\n".join(f'  - "{example}"' for example in examples)
    return f"\nBeispiele:\n{formatted}"


def _format_pii_items(items: list[dict[str, Any]]) -> str:
    """Format include or exclude config items as prompt bullets."""
    sections: list[str] = []

    for item in items:
        category = item["category"]
        label = item.get("label", category)
        description = item["description"]
        examples = item.get("examples")

        sections.append(f'- Kategorie "{category}" — {label}\n  {description}{_format_examples(examples)}')

    return "\n\n".join(sections)


def _allowed_categories(items: list[dict[str, Any]]) -> list[str]:
    """Return configured output categories."""
    return [item["category"] for item in items]


def _build_pii_extraction_system_prompt() -> str:
    """Build the LLM extraction system prompt from JSON PII configs."""
    include_items = _load_pii_config(_PII_INCLUDE_CONFIG_PATH)
    exclude_items = _load_pii_config(_PII_EXCLUDE_CONFIG_PATH)
    categories = _allowed_categories(include_items)

    include_section = _format_pii_items(include_items)
    exclude_section = _format_pii_items(exclude_items)
    category_list = ", ".join(f'"{category}"' for category in categories)

    return wrap_system_prompt(f"""\
Du bist ein Experte für Datenschutz und Anonymisierung deutscher Verwaltungsdokumente, insbesondere \
Planfeststellungsbeschlüsse (PFB), Einwendungen und behördliche Stellungnahmen.

Deine Aufgabe ist es, schwärzungsbedürftige personenbezogene und kontaktbezogene Daten im vom Nutzer bereitgestellten \
Text zu identifizieren. Du bist präzise und vermeidest sowohl Über- als auch Unterschwärzung.

Extrahiere alle Textstellen, die geschwärzt werden sollen. Gib nur Textstellen zurück, die im Eingabetext exakt so \
vorkommen. Erfinde, normalisiere oder korrigiere nichts.

Wichtig: Ziel ist es, dass wir danach über String Matching die gefundenen Textstellen zuverlässig im Originaldokument \
lokalisieren, daher müssen die PII wörtlich und exakt so extrahiert werden, wie sie im Text vorkommen, inklusive aller \
OCR-Fehler, Zeilenumbrüche, Bindestriche, ungewöhnlicher Schreibweisen usw.

Ignoriere technische Wrapper, Seitentrenner und Markierungen wie \
"<¤EXTERNAL_DATA¤>", "</¤EXTERNAL_DATA¤>", "=== SEITE 0 ===" usw. \
Diese Markierungen selbst sind keine PII.

## Was geschwärzt werden MUSS:

{include_section}

## Was NICHT geschwärzt werden darf:

{exclude_section}

## Regeln zur Extraktion

- Jeder Treffer im "text"-Feld muss ein einzelner, kurzer PII-Ausdruck sein (z.B. ein Name, eine Adresse, eine \
Telefonnummer). Kopiere NIEMALS ganze Sätze, Absätze oder mehrere PII-Werte in ein einzelnes "text"-Feld. \
Wenn ein Satz mehrere PII enthält, erzeuge für jede PII einen eigenen Eintrag.

- Extrahiere immer den kleinsten sinnvollen schwärzungsbedürftigen Textabschnitt.
Richtig: "Marcus Krüger"
Falsch: "Name: Marcus Krüger"
Falsch: "Marcus Krüger ist der Projektleiter und wohnt in Berlin."

Richtig: "Marcus.Krueger@L.de"
Falsch: "E-Mail: Marcus.Krueger@L.de"

- Extrahiere jeden PII-Wert einzeln — ein Eintrag pro PII.
Beispiel: "Vorname: Max, Nachname: Mustermann"
Richtig: "Max" und "Mustermann" als separate Einträge
Falsch: "Vorname: Max, Nachname: Mustermann" als ein Eintrag
Falsch: "Max Mustermann" (zusammengesetzt, steht so nicht im Text)

- Bewahre den Originaltext exakt, inklusive OCR-Fehlern, Leerzeichen, Zeilenumbrüchen, Bindestrichen und \
ungewöhnlicher Schreibweise.

- Wenn eine Adresse durch OCR-Zeilenumbrüche oder mehrere Leerzeichen getrennt ist, extrahiere sie trotzdem als eine \
Adresse, aber mit exakt dem im Eingabetext vorhandenen Textausschnitt.

- Straßennamen, die nach einer natürlichen Person benannt sind, sind nicht als Personenname zu extrahieren.
Beispiel:
In "Arno-Nitzsche-Straße 35 04277 Leipzig" nicht zusätzlich "Arno-Nitzsche" als Name extrahieren. Die gesamte Adresse \
wird als "adresse" extrahiert.

- Wenn sich Treffer überschneiden, bevorzuge den spezifischeren Treffer.
Beispiel:
Bei einer vollständigen Adresse extrahiere die gesamte Adresse als "adresse" und nicht zusätzlich Straße, PLZ oder Ort \
einzeln.

- WICHTIG: Extrahiere ausschließlich Kategorien aus dem Abschnitt "Was geschwärzt werden MUSS". \
Beispiele in den "Regeln zur Extraktion" dienen nur der Form der Extraktion, nicht der Freigabe weiterer Kategorien. \
Wenn eine Kategorie im Abschnitt "Was geschwärzt werden MUSS" nicht aufgeführt ist, darf sie nicht extrahiert werden.

## Ausgabeformat

Gib ausschließlich valides JSON zurück. Kein Markdown, keine Erklärung, kein zusätzlicher Text.

Jeder Eintrag enthält:
- "text": den exakten Originaltext
- "kategorie": eine der erlaubten Kategorien

## WICHTIG:
Vollständigkeit:
Alle schwärzungsbedürftigen Daten der angegebenen Kategorien müssen extrahiert werden. \
Es dürfen keine echten PII übersehen werden.

Erlaubte Kategorien:
{category_list}

Beispiel-Eingabe:
"Die Stellungnahme wurde von Herrn Dr. Thomas Bergmann sowie Frau Lisa Schröder eingereicht."

Richtige Ausgabe:
{{"items": [
  {{"text": "Dr. Thomas Bergmann", "kategorie": "name"}},
  {{"text": "Lisa Schröder", "kategorie": "name"}}
]}}


Falls keine schwärzungsbedürftigen Daten gefunden werden:
{{"items": []}}
""")


def _build_pii_filter_system_prompt() -> str:
    """Build the Presidio/spaCy candidate filter system prompt from JSON PII configs."""
    include_items = _load_pii_config(_PII_INCLUDE_CONFIG_PATH)
    exclude_items = _load_pii_config(_PII_EXCLUDE_CONFIG_PATH)
    categories = _allowed_categories(include_items)

    include_section = _format_pii_items(include_items)
    exclude_section = _format_pii_items(exclude_items)
    category_list = "|".join(categories)

    return wrap_system_prompt(f"""\
Du bist ein Experte für Datenschutz und Anonymisierung deutscher Verwaltungsdokumente.
Deine Aufgabe ist es, eine Kandidatenliste eines NER-Detektors zu filtern.

Behalte ausschließlich Kandidaten, die einer der konfigurierten schwärzungsbedürftigen Kategorien entsprechen.
Verwende dieselben Regeln wie bei der PII-Extraktion.

## Kandidaten behalten, wenn sie hierzu passen

{include_section}

## Kandidaten verwerfen, wenn sie hierzu passen

{exclude_section}

## Filterregeln

- Gib nur Kandidaten zurück, die tatsächlich geschwärzt werden sollen.
- Gib den Kandidatentext exakt so zurück, wie er in der Kandidatenliste vorkommt.
- Erfinde, normalisiere oder korrigiere nichts.
- Verwirf Labels, Überschriften, generische Substantive, technische Kennungen und Sachbegriffe, sofern sie nicht klar \
einer zu schwärzenden Kategorie entsprechen.
- Wenn ein Kandidat nur teilweise schwärzungsbedürftig ist, gib trotzdem nur den exakten Kandidatentext zurück, \
sofern kein kleinerer Kandidat vorhanden ist.

## Ausgabeformat

Gib ausschließlich valides JSON zurück. Kein Markdown, keine Erklärung, kein zusätzlicher Text.

Erlaubte Kategorien:
{category_list}

Beispiel-Eingabe:
Kandidaten:
- Dr. Thomas Bergmann
- Frau Lisa Schröder
- Grundstück
- Umweltverträglichkeitsprüfung

Richtige Ausgabe:
{{"items": [
  {{"text": "Dr. Thomas Bergmann", "kategorie": "name"}},
  {{"text": "Frau Lisa Schröder", "kategorie": "name"}}
]}}

Falls kein Kandidat schwärzungsbedürftig ist:
{{"items": []}}
""")


# ---------------------------------------------------------------------------
# Extraction: System prompt (instructions) + User prompt (input data)
# ---------------------------------------------------------------------------

PII_EXTRACTION_SYSTEM_PROMPT = _build_pii_extraction_system_prompt()

PII_EXTRACTION_USER_PROMPT = """\
{external_data_tag_open}
{chunk}
{external_data_tag_close}"""

# ---------------------------------------------------------------------------
# Filter: System prompt (instructions) + User prompt (input data)
# ---------------------------------------------------------------------------

PII_FILTER_SYSTEM_PROMPT = _build_pii_filter_system_prompt()

PII_FILTER_USER_PROMPT = """\
{external_data_tag_open}
{candidates}
{external_data_tag_close}"""
