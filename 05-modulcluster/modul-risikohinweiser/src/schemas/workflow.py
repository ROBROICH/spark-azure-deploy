from typing import Literal

from pydantic import BaseModel, Field

QualityCriteria = Literal[
    "BESTIMMTHEIT",
    "NORM_VERANKERUNG",
    "JUR_PRAEZISION",
    "PRAEGNANZ_SUBSTANZ",
    "FUNDIERUNG",
    "ARG_SYSTEMATIK",
    "ARG_STRINGENZ",
    "ABWAEGUNGSSORGFALT",
    "WUERDIGUNGSTIEFE",
]


class IntentionAnalysisResponse(BaseModel):
    analysis_rationale: str = Field(
        ..., description="Kurze deduktive Begründung der Analyseergebnisse (Chain-of-Thought).", max_length=500
    )
    main_part: Literal["ENTSCHEIDUNG", "BEGRUENDUNG", "RECHTSBEHELFSBELEHRUNG"] = Field(
        ..., description="Strikte Zuordnung zum Hauptteil des Planfeststellungsbeschlusses."
    )
    subpart: str = Field(
        ...,
        description="Die Rolle innerhalb des Hauptteils (z.B. 'Tenor', 'Nebenbestimmungen', 'Sachverhalt', 'Einwendungsbehandlung').",
        max_length=150,
    )
    structure: str = Field(..., description="Der narrative Flow/Aufbau des Kapitels.", max_length=300)
    purpose: str = Field(
        ..., description="Die übergeordnete kommunikative Funktion des Kapitels im Gesamtkontext.", max_length=300
    )
    content_focus: str = Field(
        ..., description="Der materielle Schwerpunkt des Kapitels in Stichworten.", max_length=200
    )
    exclusions: str = Field(
        ...,
        description="Negativabgrenzung: Welche Funktionen, Begründungen oder Details werden hier bewusst NICHT behandelt, um Redundanzen zu vermeiden (z.B. 'Keine rechtliche Herleitung der Pflichten').",
        max_length=300,
    )
    dependencies: str = Field(
        ...,
        description="Systematische Verknüpfung: Auf welchen vorgelagerten Kapiteln baut dieses Kapitel inhaltlich auf (Input) oder für welche nachgelagerten Kapitel liefert es die Grundlage (Output)?",
        max_length=300,
    )


class QualityCriterionDefinition(BaseModel):
    relevance_rating: int = Field(
        ...,
        ge=1,
        le=5,
        description="Relevanz des Qualitätskriteriums für die Kapitelintention auf einer Skala von 1 (kaum relevant) bis 5 (essenziell).",
    )
    fullfilment_minimal: str = Field(
        ...,
        max_length=1000,
        description="Beschreibung dessen, was mindestens gegeben sein muss, damit das Qualitätskriterium als erfüllt gilt.",
    )
    fullfilment_optimal: str = Field(
        ...,
        max_length=1000,
        description="Beschreibung dessen, was idealerweise gegeben sein sollte, damit das Qualitätskriterium als optimal erfüllt gilt.",
    )
    fullfilment_negative: str = Field(
        ...,
        max_length=1000,
        description="Beschreibung der für einen jur. Angriff relevanten Merkmale, die gegen das Qualitätskriterium sprechen",
    )


class CriterionRatingItem(QualityCriterionDefinition):
    """Single criterion rating identified by its criterion name."""

    criterion: QualityCriteria = Field(description="Name des Qualitätskriteriums.")


class CriteriaDefinitionResponse(BaseModel):
    criterion_ratings: list[CriterionRatingItem] = Field(
        description="List of criterion ratings, one per quality criterion."
    )


class QualityAnalysisRequest(BaseModel):
    chapter: str
    analysis_focus: str
    main_part: str
    subpart: str
    purpose: str
    structure: str
    exclusions: str
    dependencies: str
    fullfilment_minimal: str
    fullfilment_optimal: str
    fullfilment_negative: str


class QualityCheckItem(BaseModel):
    rating_rationale: str = Field(
        ...,
        description="Kurze Begründung der Bewertung unter Berücksichtigung des Kontextes",
    )
    quote: str = Field(..., description="Exakter Substring aus dem Kapitel, der bewertet wird.")
    rating: int = Field(..., ge=1, le=5, description="Bewertung von 1 (Mangel) bis 5 (Optimal).")
    breached_standard_negative: str = Field(
        ...,
        description="Verletzter Qualitätsstandard bei negativer Bewertung.",
    )


class QualityAnalysisResponse(BaseModel):
    quality_check_results: list[QualityCheckItem]


class RiskFormulatorInput(BaseModel):
    chapter_text: str
    quality_defects: dict[int, QualityCheckItem]  # Low-Quality-Components als Basis für die Risikoformulierung


class RiskFormulatorFinding(BaseModel):
    involved_defects: list[int] = Field(..., description="IDs der Qualitätsmängel, die diesem Risiko zugrunde liegen")
    main_defect_id: int = Field(..., description="ID des Hauptmangels, der das Risiko am stärksten repräsentiert")
    quote: str = Field(..., description="Der konkrete Textausschnitt, der den Risikohinweis illustriert")
    description: str = Field(..., description="Beschreibung des Risikos")
    implications: str = Field(..., description="Mögliche Auswirkungen des Risikos")
    recommendation: str = Field(..., description="Empfohlene Maßnahmen zur Risikominderung")
    severity: int = Field(
        ..., ge=1, le=10, description="Schwere des Risikos auf einer Skala von 1 (gering) bis 10 (sehr hoch)"
    )


class RiskFormulatorResponse(BaseModel):
    risks: list[RiskFormulatorFinding]
