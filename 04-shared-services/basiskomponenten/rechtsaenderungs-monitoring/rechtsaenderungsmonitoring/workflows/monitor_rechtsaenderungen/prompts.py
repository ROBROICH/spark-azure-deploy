"""Prompts and structured-output schemas for the monitor_rechtsaenderungen LLM calls.

Plain pydantic models + prompt strings, imported by the workflow-level helpers in
``llm.py``. The actual LLM execution runs on the shared ``llm-client`` Temporal
worker via ``temporal.activities.llm.llm_invoke_structured``; the JSON schema of
the ``output_class`` is enforced there, so the prompts no longer need to spell out
format instructions.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from datetime import date
from rechtsaenderungsmonitoring.schemas.db import DocType
from rechtsaenderungsmonitoring.schemas.temporal import NormResult, NormFull


class EnrichmentResponse(BaseModel):
    """Strukturierte Ausgabe des Ergänzungs-LLM-Aufrufs."""

    success: bool
    affected_norms: list[NormFull]


class SummaryResponse(BaseModel):
    """Strukturierte Ausgabe des Zusammenfassungs-LLM-Aufrufs."""

    success: bool
    valid_from: date = Field(..., description="Datum, an dem die Änderungen in Kraft treten")
    affected_norms: list[NormResult]


class CategorisationResult(BaseModel):
    """Strukturierte Ausgabe des Kategorisierungs-LLM-Aufrufs."""

    category: DocType


ENRICHMENT_PROMPT = """\
Im Verkündungsblatt wurde dieser text gefunden:
{source_text}

---
Ergänze die fehlenden Werte für `change_text` bzw. `new_text`
im folgenden `NormFull` Objekt:
{norm_result}
"""

SUMMARISATION_PROMPT = """\
Fasse alle in dem folgenden Textausschnitt beschriebenen Normänderungen zusammen.
Ignoriere Änderungen am Inhaltsverzeichnis und an Überschriften.

Gib für jede betroffene Norm einen Eintrag in `affected_norms` an und setze die
`success` Eigenschaft auf den entsprechenden booleschen Wert.
**Artikel die informationen über `Inkrafttreten` enthalten beschreiben den `valid_from` Eigenschaft, nicht Normänderungen.**
**Gib nur einen Eintrag pro Artikel/Paragraph_nr zurück. Sammle mehrere Änderungen an einem
Paragraphen in jeweils einem Eintrag. Die `paragraph_nr` Eigenschaft soll nie Absatz/Satz oder
weitere Ebenen, oder `Art.`/`§` und ähnliche Präfixe enthalten.**
**Ignoriere Änderungen an Anlagen, Anhängen, Verzeichnissen, Überschriften.
Ekstrahiere nur Normänderungen mit Artikel- oder §-Nummern.**
**Gestrichene Normeinträge werden mit `(weggefallen)` markiert**

text:
{text}
"""

CATEGORISATION_PROMPT = """\
Kategorisiere die folgende Überschrift:
{heading}

in eine der folgenden Kategorien:
{categories}
"""
