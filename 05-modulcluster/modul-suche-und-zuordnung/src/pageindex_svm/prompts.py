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
    relevance: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Wie weit die ausgewählten Sätze eine Prüfung des TBM tragen (0.0 bis 1.0).",
    )


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

RELEVANZWERT:
Gib zusätzlich für jeden Abschnitt einen Relevanzwert zwischen 0.0 und 1.0 an. Der Wert sagt, wie weit die von dir ausgewählten Sätze eine Prüfung des TBM tragen.

Wertebereiche:
- 0.9 bis 1.0: Die Sätze enthalten konkrete Angaben genau zu dem Sachverhalt, den das TBM erfasst - zum Beispiel Werte, Maße, Fristen, Orte oder geplante Maßnahmen. Die Prüfung ist allein aus diesen Sätzen möglich.
- 0.6 bis 0.8: Die Sätze enthalten Angaben zu diesem Sachverhalt, aber unvollständig, allgemein oder auf eine weitere Fundstelle angewiesen. Die Prüfung ist nur in Kombination möglich.
- 0.3 bis 0.5: Die Sätze betreffen denselben Themenbereich, enthalten aber keine Angaben, die die Prüfung tragen - zum Beispiel eine Methodenbeschreibung, eine Ankündigung oder einen Verweis auf ein anderes Dokument.
- 0.0 bis 0.2: Die Sätze enthalten nur Dokumentkontext - zum Beispiel eine Überschrift, eine Formalie oder ein fremdes Thema. Sie tragen nichts zur Prüfung bei.

Regeln für den Relevanzwert:
- Das Dokument benennt das TBM in der Regel NICHT. Eine Nennung ist nicht erforderlich und hebt den Wert für sich genommen nicht an.
- Sätze, die gegen die Erfüllung des TBM sprechen, erhalten denselben Wert wie Sätze, die dafür sprechen. Bewertet wird der Prüfnutzen, nicht das Ergebnis.
- Maßgeblich ist die Konkretheit und Vollständigkeit der Angaben, nicht die Länge der Passage und nicht die Bestimmtheit der Formulierung.
- Passt ein Abschnitt auf keinen der beschriebenen Bereiche, verwende den untersten Bereich.

ERGEBNIS:
- Du MUSST ausschließlich im vorgegebenen JSON-Schema antworten. NIEMALS zusätzliche Felder oder Freitext außerhalb des Schemas.

Antwort-Schema:
{{
  "results": [
    {{
      "node_id": "<string>",           // Die node_id des Abschnitts
      "relevant_indices": [<int>, ...], // Die Indices der relevanten Sätze (beginnend bei 0)
      "begruendung": "<string>",        // Kurze Begründung für die Auswahl
      "relevance": <float>              // Relevanzwert zwischen 0.0 und 1.0 nach den Wertebereichen oben
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
