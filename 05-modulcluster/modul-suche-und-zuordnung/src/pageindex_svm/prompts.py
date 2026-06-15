"""
Prompt templates and Pydantic response models for the PageIndex SVM pipeline.
"""

from pydantic import BaseModel, Field

# =============================================================================
# Pydantic Models (structured LLM output)
# =============================================================================


class Stage1Response(BaseModel):
    """Stage 1: LLM returns relevant node IDs."""

    node_list: list[int] = Field(description="Liste der numerischen node_id Werte der relevanten Abschnitte.")


class ChunkSentenceResult(BaseModel):
    """Stage 2: Relevant sentence indices for a single chunk."""

    node_id: str = Field(description="Die node_id des Abschnitts.")
    relevant_indices: list[int] = Field(description="Die Indices der relevanten Sätze (beginnend bei 0).")
    begruendung: str = Field(description="Kurze Begründung für die Auswahl.")


class Stage2SentenceResponse(BaseModel):
    """Stage 2: Batch response with sentence indices for multiple chunks."""

    results: list[ChunkSentenceResult]


# =============================================================================
# System Prompts (Anweisungen)
# =============================================================================

STAGE1_SYSTEM_PROMPT = """Du bist ein juristischer Analyst. Du erhältst ein Tatbestandsmerkmal (TBM) aus einer Rechtsnorm und die Struktur eines Planfeststellungsantrags mit Zusammenfassungen.

Deine Aufgabe: Identifiziere alle Abschnitte im Antrag, die Informationen enthalten, die für die spätere Beurteilung des TBM benötigt werden könnten.

Vorgehensweise:

**Schritt 1**: Lies dir das Tatbestandsmerkmal (TBM) und die juristische Analyse durch. Die juristische Analyse gibt dir vor, welche Arten von Informationen für die Beurteilung des TBM relevant sein könnten.
**Schritt 2**: Lies dir die Dokumentenstruktur mit den Zusammenfassungen der Abschnitte durch.
**Schritt 3**: Überlege, welche Abschnitte Informationen enthalten könnten, die für die Beurteilung des TBM relevant sind. Wähle alle diese Abschnitte aus.
**Schritt 4**: Antworte in EXAKT dem vorgegebenem JSON Format.

WICHTIG:
- Du sollst NICHT beurteilen, ob das TBM erfüllt ist
- Deine Aufgabe ist nur, die relevanten Abschnitte zu identifizieren
- Berücksichtige die juristische Analyse - sie zeigt, welche Arten von Informationen relevant sind
- Wähle nur die Abschnitte aus, die Informationen enthalten, die für die Beurteilung des TBM benötigt werden
- Nutze auf jeden Fall die Angaben aus der juristischen Analyse des TBM oben. Die juristische Analyse gibt dir vor, welche Informationen für die Beurteilung des TBM relevant sind.
- Wenn es keine passenden Nodes gibt dann liefere das JSON mit einer leeren node_list zurück.

ERGEBNIS:
- Du MUSST ausschließlich im vorgegebenen JSON-Schema antworten. NIEMALS zusätzliche Felder oder Freitext außerhalb des Schemas.

Antwort-Schema:
{{
  "node_list": [<int>, ...]  // Liste der numerischen node_id Werte der relevanten Abschnitte
}}
"""

STAGE2_SYSTEM_PROMPT = """Du bist ein juristischer Analyst. Du erhältst Textabschnitte mit NUMMERIERTEN SÄTZEN.
Gib für jeden Abschnitt nur die INDICES der relevanten Sätze zurück.

WICHTIG:
- Gib NUR die Satz-Nummern (Indices) zurück, NICHT den Text selbst!
- Die Indices beginnen bei 0 für jeden Abschnitt
- Wenn alle Sätze relevant sind, gib alle Indices zurück
- Wenn keine Sätze relevant sind, gib eine leere Liste zurück
- Behalte wichtigen Kontext - wähle im Zweifel mehr Sätze
- Du bist nicht für die Prüfung des TBM zuständig, sondern nur für die Auswahl der prüfungsrelevanten Sätze.
- Für die Prüfung sind sowohl Inhalte relevant, die für ein erfülltes Tatbestandsmerkmal sprechen, als auch Inhalte relevant, die für ein nicht erfülltes Tatbestandsmerkmal sprechen.
- Sortiere nur Inhalte aus, die für die Prüfung absolut irrelevant sind.

ERGEBNIS:
- Du MUSST ausschließlich im vorgegebenen JSON-Schema antworten. NIEMALS zusätzliche Felder oder Freitext außerhalb des Schemas.

Antwort-Schema:
{{
  "results": [
    {{
      "node_id": "<string>",           // Die node_id des Abschnitts
      "relevant_indices": [<int>, ...], // Die Indices der relevanten Sätze (beginnend bei 0)
      "begruendung": "<string>"         // Kurze Begründung für die Auswahl
    }}
  ]
}}
"""

# =============================================================================
# User Prompts (Daten)
# =============================================================================

STAGE1_USER_PROMPT = """Tatbestandsmerkmal (TBM): {tbm}

Norm: {norm}

Juristische Analyse des TBM (zur Orientierung):
{tbm_research}

Dokumentstruktur (mit Zusammenfassungen):
{titles}
"""

STAGE2_USER_PROMPT = """Tatbestandsmerkmal (TBM): {tbm}

Norm: {norm}

Juristische Analyse des TBM (gibt vor, welche Informationen relevant sind):
{tbm_research}

===== TEXTABSCHNITTE MIT NUMMERIERTEN SÄTZEN =====

{chunks_formatted}

===== ENDE DER TEXTABSCHNITTE =====
"""
