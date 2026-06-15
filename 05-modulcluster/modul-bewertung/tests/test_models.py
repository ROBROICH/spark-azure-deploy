"""Tests für Domain-Modelle."""

import json

from src.models.types import (
    ChapterDraft,
    ChapterResult,
    DetailedPlan,
    FinalOutput,
    MicroSummary,
    PlanSection,
    PlanSubsection,
    QualityIssue,
    QualityReviewResult,
    ResultType,
    SvmMicroList,
)


class TestResultType:
    """Tests for the ResultType enum."""
    def test_enum_values(self) -> None:
        """Test enum string values."""
        assert ResultType.ERFUELLT.value == "erfuellt"
        assert ResultType.NICHT_ERFUELLT.value == "nicht_erfuellt"
        assert ResultType.NICHT_BEURTEILBAR.value == "nicht_beurteilbar"

    def test_from_string(self) -> None:
        """Test constructing enum from string."""
        assert ResultType("erfuellt") == ResultType.ERFUELLT
        assert ResultType("nicht_erfuellt") == ResultType.NICHT_ERFUELLT
        assert ResultType("nicht_beurteilbar") == ResultType.NICHT_BEURTEILBAR


class TestMicroSummary:
    """Tests for MicroSummary model."""
    def test_creation(self) -> None:
        """Test creating a MicroSummary."""
        micro = MicroSummary(svm_id="0001", kernaussage="Test Kernaussage")
        assert micro.svm_id == "0001"
        assert micro.kernaussage == "Test Kernaussage"

    def test_serialization(self) -> None:
        """Test roundtrip serialization."""
        micro = MicroSummary(svm_id="0001", kernaussage="Test")
        data = micro.model_dump()
        assert data == {"svm_id": "0001", "kernaussage": "Test"}

        restored = MicroSummary(**data)
        assert restored == micro


class TestSvmMicroList:
    """Tests for SvmMicroList model."""
    def test_creation(self) -> None:
        """Test creating a SvmMicroList."""
        micros = SvmMicroList(
            satz_text="Test TBM",
            micros=[
                MicroSummary(svm_id="0001", kernaussage="Kernaussage 1"),
                MicroSummary(svm_id="0002", kernaussage="Kernaussage 2"),
            ],
        )
        assert len(micros.micros) == 2
        assert micros.satz_text == "Test TBM"


class TestDetailedPlan:
    """Tests for DetailedPlan model."""
    def test_creation_with_subsections(self) -> None:
        """Test creating a plan with subsections."""
        plan = DetailedPlan(
            kapitel=[
                PlanSection(
                    titel="Einleitung",
                    ziel="Einordnung",
                    svm_ids=["0001"],
                    unterkapitel=[],
                ),
                PlanSection(
                    titel="Prüfung",
                    ziel="Systematische Prüfung",
                    svm_ids=["0002", "0003"],
                    unterkapitel=[
                        PlanSubsection(
                            titel="Aspekt 1",
                            fokus="Fokus 1",
                            struktur="Darstellung → Bewertung",
                        ),
                    ],
                ),
                PlanSection(
                    titel="Ergebnis",
                    ziel="Zusammenfassung",
                    svm_ids=["0004"],
                    unterkapitel=[],
                ),
            ],
        )
        assert len(plan.kapitel) == 3
        assert len(plan.kapitel[1].unterkapitel) == 1
        assert plan.kapitel[1].unterkapitel[0].struktur == "Darstellung → Bewertung"

    def test_json_roundtrip(self) -> None:
        """Test JSON roundtrip serialization."""
        plan = DetailedPlan(
            kapitel=[
                PlanSection(titel="A", ziel="Z", svm_ids=["0001"]),
                PlanSection(titel="B", ziel="Z", svm_ids=["0002"]),
                PlanSection(titel="C", ziel="Z", svm_ids=["0003"]),
            ],
        )
        json_str = plan.model_dump_json()
        restored = DetailedPlan(**json.loads(json_str))
        assert restored == plan


class TestChapterDraft:
    """Tests for ChapterDraft model."""

    def test_with_kurzform(self) -> None:
        """Test draft with kurzform field."""
        draft = ChapterDraft(
            titel="Ergebnis",
            markdown="## Ergebnis\n\nText",
            used_svm_ids=["0001", "0002"],
            kurzform="Das TBM ist nicht erfüllt.",
        )
        assert draft.kurzform is not None

    def test_without_kurzform(self) -> None:
        """Test draft without kurzform field."""
        draft = ChapterDraft(
            titel="Einleitung",
            markdown="## Einleitung\n\nText",
            used_svm_ids=["0001"],
        )
        assert draft.kurzform is None


class TestQualityReviewResult:
    """Tests for QualityReviewResult model."""

    def test_with_issues(self) -> None:
        """Test review result containing issues."""
        result = QualityReviewResult(
            issues=[
                QualityIssue(
                    kategorie="Fehler",
                    stelle="Zeile 5",
                    problem="Falsche Aussage",
                    korrektur="Korrigiert",
                ),
            ],
            revised_markdown="## Korrigiert\n\nText",
            revised_used_svm_ids=["0001"],
        )
        assert len(result.issues) == 1

    def test_no_issues(self) -> None:
        """Test review result with no issues."""
        result = QualityReviewResult(
            issues=[],
            revised_markdown="## Unverändert",
            revised_used_svm_ids=["0001"],
        )
        assert len(result.issues) == 0


class TestFinalOutput:
    """Tests for FinalOutput model."""
    def _make_output(self) -> FinalOutput:
        """Create a sample FinalOutput for testing."""
        return FinalOutput(
            satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            norm="BNatSchG\n§ 44\nArtenschutz",
            satz_text="Test TBM",
            result=ResultType.NICHT_ERFUELLT,
            kurzform="Das TBM ist nicht erfüllt.",
            plan=DetailedPlan(
                kapitel=[
                    PlanSection(titel="Einleitung", ziel="Z", svm_ids=["0001"]),
                    PlanSection(titel="Prüfung", ziel="Z", svm_ids=["0002"]),
                    PlanSection(titel="Ergebnis", ziel="Z", svm_ids=["0003"]),
                ],
            ),
            kapitel=[
                ChapterResult(
                    titel="Einleitung",
                    markdown="## Einleitung\n\nText [0001]",
                    used_svm_ids=["0001"],
                ),
                ChapterResult(
                    titel="Ergebnis",
                    markdown="## Ergebnis\n\nBewertung [0003]",
                    used_svm_ids=["0003"],
                    kurzform="Nicht erfüllt.",
                ),
            ],
        )

    def test_to_text(self) -> None:
        """Test Markdown text generation."""
        output = self._make_output()
        text = output.to_text()
        assert "# Rechtliche Bewertung: Artenschutz" in text
        assert "NICHT ERFÜLLT" in text

    def test_serialization(self) -> None:
        """Test model serialization roundtrip."""
        output = self._make_output()
        data = output.model_dump()
        restored = FinalOutput(**data)
        assert restored.result == ResultType.NICHT_ERFUELLT
        assert len(restored.kapitel) == 2

    def test_parse_norm_two_parts(self) -> None:
        """Teste _parse_norm mit 2-teiliger Norm (z.B. '§ 44\nArtenschutz')."""
        output = FinalOutput(
            satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            norm="§ 44\nArtenschutz",
            satz_text="Test TBM",
            result=ResultType.ERFUELLT,
            plan=DetailedPlan(
                kapitel=[
                    PlanSection(titel="A", ziel="Z", svm_ids=["0001"]),
                    PlanSection(titel="B", ziel="Z", svm_ids=["0002"]),
                    PlanSection(titel="C", ziel="Z", svm_ids=["0003"]),
                ],
            ),
            kapitel=[
                ChapterResult(titel="A", markdown="## A\n\nText", used_svm_ids=["0001"]),
            ],
        )
        text = output.to_text()
        assert "Artenschutz" in text
        assert "§ 44 – Artenschutz" in text  # noqa: RUF001

    def test_parse_norm_single_part(self) -> None:
        """Teste _parse_norm mit einzeiliger Norm."""
        output = FinalOutput(
            satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            norm="Artenschutzrecht",
            satz_text="Test TBM",
            result=ResultType.NICHT_BEURTEILBAR,
            plan=DetailedPlan(
                kapitel=[
                    PlanSection(titel="A", ziel="Z", svm_ids=["0001"]),
                    PlanSection(titel="B", ziel="Z", svm_ids=["0002"]),
                    PlanSection(titel="C", ziel="Z", svm_ids=["0003"]),
                ],
            ),
            kapitel=[
                ChapterResult(titel="A", markdown="## A\n\nText", used_svm_ids=["0001"]),
            ],
        )
        text = output.to_text()
        assert "Artenschutzrecht" in text

    def test_to_text_without_kurzform(self) -> None:
        """Teste to_text ohne Kurzform."""
        output = FinalOutput(
            satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            norm="BNatSchG\n§ 44\nArtenschutz",
            satz_text="Test TBM",
            result=ResultType.ERFUELLT,
            kurzform=None,
            plan=DetailedPlan(
                kapitel=[
                    PlanSection(titel="A", ziel="Z", svm_ids=["0001"]),
                    PlanSection(titel="B", ziel="Z", svm_ids=["0002"]),
                    PlanSection(titel="C", ziel="Z", svm_ids=["0003"]),
                ],
            ),
            kapitel=[
                ChapterResult(titel="A", markdown="## A\n\nText [0001]", used_svm_ids=["0001"]),
            ],
        )
        text = output.to_text()
        assert "ERFÜLLT" in text
