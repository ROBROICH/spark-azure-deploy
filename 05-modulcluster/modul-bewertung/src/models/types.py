"""Domain models and workflow I/O types for the assessment workflow."""

import logging
import re
from enum import Enum

from pydantic import BaseModel, Field
from temporal.contracts import Originaltext

__all__ = ["DetailedPlan", "Originaltext", "PlanSection", "PlanSubsection"]

_logger = logging.getLogger(__name__)


class PlanSubsection(BaseModel):
    titel: str
    fokus: str
    struktur: str | None = None


class PlanSection(BaseModel):
    titel: str
    ziel: str
    svm_ids: list[str] = Field(min_length=1)
    unterkapitel: list[PlanSubsection] = Field(default_factory=list)


class DetailedPlan(BaseModel):
    kapitel: list[PlanSection] = Field(min_length=3, max_length=12)


class ResultType(str, Enum):
    """Possible assessment outcomes for a legal requirement."""
    ERFUELLT = "erfuellt"
    NICHT_ERFUELLT = "nicht_erfuellt"
    NICHT_BEURTEILBAR = "nicht_beurteilbar"

    @staticmethod
    def parse_urteil(value: str | None) -> "ResultType | None":
        """Parse an LLM response string into a ResultType, with fuzzy matching."""
        if not value:
            return None

        lower = value.strip().lower()

        mapping = {
            "erfuellt": ResultType.ERFUELLT,
            "nicht_erfuellt": ResultType.NICHT_ERFUELLT,
            "nicht_beurteilbar": ResultType.NICHT_BEURTEILBAR,
        }
        if lower in mapping:
            return mapping[lower]

        # Fuzzy fallback for slight LLM deviations
        if "nicht" in lower and ("erfuellt" in lower or "erf\u00fcllt" in lower):
            return ResultType.NICHT_ERFUELLT
        if "erfuellt" in lower or "erf\u00fcllt" in lower:
            return ResultType.ERFUELLT
        if "nicht" in lower and "beurteilbar" in lower:
            return ResultType.NICHT_BEURTEILBAR

        _logger.warning(
            "Urteil '%s' from LLM response could not be recognized — falling back to NICHT_BEURTEILBAR",
            value,
        )
        return ResultType.NICHT_BEURTEILBAR


class MicroSummary(BaseModel):
    """Condensed summary of a single source chunk."""
    svm_id: str
    kernaussage: str = Field(description="2-3 Sätze mit konkreten Fakten")


class SvmMicroList(BaseModel):
    """List of micro-summaries for one legal requirement."""
    satz_text: str
    micros: list[MicroSummary] = Field(min_length=1)


class ChapterDraft(BaseModel):
    """Draft of a single chapter before quality review."""
    titel: str
    markdown: str
    used_svm_ids: list[str]
    kurzform: str | None = Field(
        default=None,
        description="Kurzform der Gesamtbewertung im Urteilsstil (nur beim Ergebnis-Kapitel)",
    )
    urteil: ResultType | None = Field(
        default=None,
        description="Vom LLM abgeleitetes Urteil (nur beim Ergebnis-Kapitel)",
    )


class QualityIssue(BaseModel):
    """Single issue found during quality review."""
    kategorie: str = Field(
        description=(
            "Art des Problems: Fehler, Inkonsistenz, Halluzination, Fehlender Beleg, Falsche Darstellung, Ungenauigkeit"
        ),
    )
    stelle: str = Field(description="Betroffener Textausschnitt oder Stelle")
    problem: str = Field(description="Beschreibung des identifizierten Problems")
    korrektur: str = Field(description="Vorgenommene Korrektur")


class QualityReviewResult(BaseModel):
    """Result of the quality review for a chapter."""
    issues: list[QualityIssue] = Field(default_factory=list)
    revised_markdown: str
    revised_used_svm_ids: list[str]
    revised_kurzform: str | None = Field(
        default=None,
        description="Überarbeitete Kurzform im Urteilsstil (nur beim Ergebnis-Kapitel)",
    )
    revised_urteil: str | None = Field(
        default=None,
        description="Überarbeitetes Urteil (nur beim Ergebnis-Kapitel): erfuellt | nicht_erfuellt | nicht_beurteilbar",
    )


class ChapterResult(BaseModel):
    """Final chapter including quality-reviewed content."""
    titel: str = Field(description="Kapiteltitel")
    markdown: str = Field(description="Finaler Markdown-Text des Kapitels (nach Quality Review)")
    used_svm_ids: list[str] = Field(
        default_factory=list,
        description="Im Kapitel referenzierte SVM-IDs (4-stellig)",
    )
    quality_issues: list[QualityIssue] = Field(
        default_factory=list,
        description="Vom Quality-Reviewer identifizierte und korrigierte Probleme",
    )
    kurzform: str | None = Field(
        default=None,
        description="Kurzform der Gesamtbewertung im Urteilsstil (nur beim Ergebnis-Kapitel)",
    )
    urteil: ResultType | None = Field(
        default=None,
        description="Vom LLM abgeleitetes Urteil (nur beim Ergebnis-Kapitel)",
    )


# LLM response models for type-safe parsing


class ChapterWriterResponse(BaseModel):
    """Typed response from the chapter writer LLM call."""

    markdown: str
    used_svm_ids: list[str]
    kurzform: str | None = None
    urteil: str | None = None


class QualityReviewerResponse(BaseModel):
    """Typed response from the quality reviewer LLM call."""

    issues: list[QualityIssue] = Field(default_factory=list)
    revised_markdown: str
    revised_used_svm_ids: list[str]
    revised_kurzform: str | None = None
    revised_urteil: str | None = None


class FinalOutput(BaseModel):
    """Complete assessment output with all chapters and verdict."""
    satz_id: str
    norm: str
    satz_text: str
    result: ResultType
    kurzform: str | None = Field(
        default=None,
        description="Kurzform der Gesamtbewertung im Urteilsstil (5-8 Sätze)",
    )
    plan: DetailedPlan
    kapitel: list[ChapterResult] = Field(
        description="Strukturierte Kapitel-Ergebnisse mit Markdown, SVM-IDs und Quality-Issues",
    )

    def to_text(self) -> str:
        """Format as Markdown text."""
        titel, norm_kompakt = self._parse_norm()
        tbm_clean = self._clean_satz_text()

        lines = [
            f"# Rechtliche Bewertung: {titel}",
            "",
            f"**Norm:** {norm_kompakt}",
            "",
            f"**Tatbestandsmerkmal:** {tbm_clean}",
            "",
            f"**Ergebnis:** {self._result_text()}",
            "",
        ]

        if self.kurzform:
            lines.extend(
                [
                    self.kurzform,
                    "",
                ]
            )

        merged_markdown = "\n\n".join(kap.markdown for kap in self.kapitel)

        lines.extend(
            [
                "---",
                "",
                merged_markdown,
            ]
        )

        return "\n".join(lines)

    def _parse_norm(self) -> tuple[str, str]:
        """Extract title and compact norm reference from the norm field."""
        separator = " \u2013 "
        parts = [p.strip() for p in self.norm.strip().splitlines() if p.strip()]

        if len(parts) >= 3:
            gesetz, paragraph, titel = parts[0], parts[1], parts[2]
            return titel, separator.join([gesetz, paragraph, titel])
        if len(parts) == 2:
            return parts[1], separator.join(parts)
        return self.norm.strip(), self.norm.strip()

    def _clean_satz_text(self) -> str:
        """Clean the TBM text into compact running text."""
        return re.sub(r"\s+", " ", self.satz_text.strip())

    def _result_text(self) -> str:
        """Result text."""
        return {
            ResultType.NICHT_ERFUELLT: "Das Tatbestandsmerkmal ist NICHT ERFÜLLT.",
            ResultType.ERFUELLT: "Das Tatbestandsmerkmal ist ERFÜLLT.",
            ResultType.NICHT_BEURTEILBAR: "Das Tatbestandsmerkmal ist NICHT BEURTEILBAR.",
        }[self.result]


# Workflow I/O types for child workflows


class ApplicabilityStatus(str, Enum):
    """Possible outcomes of the TBM applicability pre-check."""
    BEWERTEN = "bewerten"
    UEBERSPRINGEN = "überspringen"
    NICHT_BEURTEILBAR = "nicht_beurteilbar"


class ApplicabilityInput(BaseModel):
    """Input for the Applicability pre-check workflow."""
    norm: str
    satz_text: str
    micros: list[MicroSummary] = Field(min_length=1)


class ApplicabilityResult(BaseModel):
    """Result of the TBM applicability pre-check."""
    status: ApplicabilityStatus
    begruendung_markdown: str | None = Field(
        default=None,
        description="Begründung (Markdown). Bei überspringen oder nicht_beurteilbar.",
    )
    kurzform: str | None = Field(
        default=None,
        description="Kurze Zusammenfassung des Prüfungsergebnisses (1-3 Sätze).",
    )


class MicroBuilderInput(BaseModel):
    """Input for the MicroBuilder child workflow."""
    norm: str
    satz_text: str
    originaltexte: list[Originaltext] = Field(min_length=1)


class PlannerInput(BaseModel):
    """Input for the Planner child workflow."""
    norm: str
    satz_text: str
    micros: list[MicroSummary] = Field(min_length=1)


class WriterInput(BaseModel):
    """Input for the Writer child workflow."""
    satz_id: str
    norm: str
    satz_text: str
    originaltexte: list[Originaltext] = Field(min_length=1)
    plan: DetailedPlan


class QualityReviewerInput(BaseModel):
    """Input for the quality reviewer."""
    draft: ChapterDraft
    chunks_text: str
    available_ids: list[str]
    satz_text: str
    norm: str
    kapitel_titel: str
    kapitel_ziel: str
    previous_chapters_text: str | None = None


class DetailPlannerEntry(BaseModel):
    """Single entry in the Detail-Planner LLM response."""
    svm_id: str
    kapitel_index: int | None = None


class DetailPlannerInput(BaseModel):
    """Input for the DetailPlanner child workflow."""
    plan: DetailedPlan
    micros_by_id: dict[str, MicroSummary]
    filtered_micros: list[MicroSummary] = Field(min_length=1)
    norm: str
    satz_text: str


class DetailPlannerResult(BaseModel):
    """Output of the DetailPlanner workflow."""
    assignments: dict[str, int] = Field(
        description="svm_id → kapitel_index (0-based) for SVMs that add new info",
    )
    skipped: list[str] = Field(
        default_factory=list,
        description="svm_ids deemed redundant",
    )
