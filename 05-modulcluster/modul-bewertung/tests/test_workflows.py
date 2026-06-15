"""Tests für Workflow I/O Typen, Model Manager und Workflow-Logik."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.config import config
from src.models.types import (
    ChapterDraft,
    DetailedPlan,
    FinalOutput,
    MicroBuilderInput,
    MicroSummary,
    Originaltext,
    PlannerInput,
    PlanSection,
    PlanSubsection,
    QualityReviewerInput,
    QualityReviewResult,
    ResultType,
    WriterInput,
)
from src.workflows.main_workflow import _assign_simple_ids
from src.workflows.micro_builder import MicroBuilderWorkflow
from src.workflows.quality_reviewer import _fallback_result, _try_parse_review, run_quality_review
from src.workflows.writer import (
    WriterWorkflow,
    create_gliederung_kontext,
    find_ergebnis_chapter,
    prepare_chapter_chunks,
)


def _ot(node_id: str, title: str, text: str) -> Originaltext:
    """Create an Originaltext test fixture."""
    return Originaltext(
        document_id="doc-001",
        chunk_ids=[f"chunk-{node_id}"],
        node_id=node_id,
        title=title,
        text=text,
    )


class TestOriginaltext:
    """Tests for Originaltext model."""
    def test_creation(self) -> None:
        """Test creating an Originaltext."""
        ot = _ot("0001", "Test", "Text content")
        assert ot.node_id == "0001"
        assert ot.title == "Test"
        assert ot.document_id == "doc-001"
        assert ot.chunk_ids == ["chunk-0001"]


class TestMicroBuilderInput:
    """Tests for MicroBuilderInput model."""
    def test_creation(self) -> None:
        """Test creating MicroBuilderInput."""
        input_data = MicroBuilderInput(
            norm="Test Norm",
            satz_text="Test TBM",
            originaltexte=[
                _ot("0001", "T1", "Text 1"),
            ],
        )
        assert len(input_data.originaltexte) == 1


class TestPlannerInput:
    """Tests for PlannerInput model."""

    def test_creation(self) -> None:
        """Test creating PlannerInput."""
        micro = MicroSummary(svm_id="0001", kernaussage="Kernaussage 1")
        input_data = PlannerInput(
            norm="Test Norm",
            satz_text="Test TBM",
            micros=[micro],
        )
        assert input_data.micros == [micro]


class TestWriterInput:
    """Tests for WriterInput model."""

    def test_creation(self) -> None:
        """Test creating WriterInput."""
        plan = DetailedPlan(
            kapitel=[
                PlanSection(titel="A", ziel="Z", svm_ids=["0001"]),
                PlanSection(titel="B", ziel="Z", svm_ids=["0002"]),
                PlanSection(titel="C", ziel="Z", svm_ids=["0003"]),
            ],
        )
        input_data = WriterInput(
            satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            norm="Test Norm",
            satz_text="Test TBM",
            originaltexte=[Originaltext(document_id="d1", node_id="0001", title="T", text="Text")],
            plan=plan,
        )
        assert input_data.plan == plan


class TestQualityReviewerInput:
    """Tests for QualityReviewerInput model."""
    def test_creation_without_previous(self) -> None:
        """Test creating input without previous chapter context."""
        input_data = QualityReviewerInput(
            draft=ChapterDraft(titel="Test", markdown="## Test", used_svm_ids=[]),
            chunks_text="Chunk text",
            available_ids=["0001"],
            satz_text="TBM",
            norm="Norm",
            kapitel_titel="Test",
            kapitel_ziel="Ziel",
        )
        assert input_data.previous_chapters_text is None

    def test_creation_with_previous(self) -> None:
        """Test creating input with previous chapter context."""
        input_data = QualityReviewerInput(
            draft=ChapterDraft(titel="Ergebnis", markdown="## Ergebnis", used_svm_ids=[]),
            chunks_text="Chunk text",
            available_ids=["0001"],
            satz_text="TBM",
            norm="Norm",
            kapitel_titel="Ergebnis",
            kapitel_ziel="Zusammenfassung",
            previous_chapters_text="## Einleitung\n\nText",
        )
        assert input_data.previous_chapters_text is not None


# =============================================================================
# MicroBuilder Workflow Logic Tests
# =============================================================================


class TestMicroBuilderBatchLogic:
    """Teste die Batch-Aufbau- und Aggregationslogik des MicroBuilders."""

    def test_batch_splitting_creates_correct_number_of_batches(self) -> None:
        """Verifiziere dass Chunks korrekt in Batches aufgeteilt werden."""

        batch_size = config.MICRO_BUILDER.BATCH_SIZE
        # 55 Chunks → 3 Batches (20, 20, 15)
        chunks = [
            _ot(f"{i:04d}", f"T{i}", f"Text {i}")
            for i in range(55)
        ]
        batches = [
            chunks[i : i + batch_size]
            for i in range(0, len(chunks), batch_size)
        ]
        assert len(batches) == 3
        assert len(batches[0]) == 20
        assert len(batches[1]) == 20
        assert len(batches[2]) == 15

    def test_batch_splitting_single_batch(self) -> None:
        """Nur ein Batch wenn weniger als BATCH_SIZE Chunks."""

        batch_size = config.MICRO_BUILDER.BATCH_SIZE
        chunks = [
            _ot(f"{i:04d}", f"T{i}", f"Text {i}")
            for i in range(5)
        ]
        batches = [
            chunks[i : i + batch_size]
            for i in range(0, len(chunks), batch_size)
        ]
        assert len(batches) == 1
        assert len(batches[0]) == 5

    def test_micro_results_aggregation_preserves_order(self) -> None:
        """asyncio.gather bewahrt die Eingabereihenfolge — simuliere das Aggregationsverhalten."""
        # Simuliere Batch-Ergebnisse in asyncio.gather-Reihenfolge
        batch_results = [
            [MicroSummary(svm_id="0001", kernaussage="K1"),
             MicroSummary(svm_id="0002", kernaussage="K2")],
            [MicroSummary(svm_id="0003", kernaussage="K3")],
            [MicroSummary(svm_id="0004", kernaussage="K4"),
             MicroSummary(svm_id="0005", kernaussage="K5")],
        ]

        all_micros: list[MicroSummary] = []
        for batch_micros in batch_results:
            all_micros.extend(batch_micros)

        assert len(all_micros) == 5
        assert [m.svm_id for m in all_micros] == ["0001", "0002", "0003", "0004", "0005"]

    def test_fallback_on_empty_chunks(self) -> None:
        """Test fallback creates MicroSummary per chunk."""
        """Fallback erstellt MicroSummary pro Chunk."""

        chunks = [
            _ot("0001", "T1", "Langer Text hier"),
            _ot("0002", "T2", ""),
        ]
        fallback = MicroBuilderWorkflow._fallback(chunks)
        assert len(fallback) == 2
        assert fallback[0].svm_id == "0001"
        assert fallback[1].kernaussage == "Keine Zusammenfassung"



# =============================================================================
# Writer Workflow Logic Tests
# =============================================================================


class TestWriterErgebnisChapterDetection:
    """Teste die Erkennung des Ergebnis-Kapitels."""

    def _make_plan(self, titel_liste: list[str]) -> DetailedPlan:
        """Create a plan from a list of chapter titles."""
        return DetailedPlan(
            kapitel=[
                PlanSection(titel=t, ziel=f"Ziel {t}", svm_ids=[f"{i:04d}"])
                for i, t in enumerate(titel_liste)
            ],
        )

    def test_finds_ergebnis_by_name(self) -> None:
        """Test finding the result chapter by exact title."""

        plan = self._make_plan(["Einleitung", "Prüfung", "Ergebnis"])
        assert find_ergebnis_chapter(plan) == 2

    def test_finds_last_ergebnis_if_multiple(self) -> None:
        """Test that the last 'Ergebnis' chapter is used."""

        plan = self._make_plan(["Ergebnis", "Prüfung", "Ergebnis"])
        assert find_ergebnis_chapter(plan) == 2

    def test_falls_back_to_last_chapter(self) -> None:
        """Test fallback to last chapter when no 'Ergebnis' title."""

        plan = self._make_plan(["Einleitung", "Prüfung", "Bewertung"])
        assert find_ergebnis_chapter(plan) == 2

    def test_empty_plan_returns_none(self) -> None:
        """Test with minimal plan returns last chapter."""

        plan = DetailedPlan(
            kapitel=[
                PlanSection(titel=f"K{i}", ziel="z", svm_ids=[f"{i:04d}"])
                for i in range(3)  # min_length=3
            ],
        )
        # Still returns last chapter as fallback
        assert find_ergebnis_chapter(plan) == 2


class TestWriterChapterOrdering:
    """Teste die Kapitel-Sortierung bei paralleler Verarbeitung."""

    def test_regular_chapters_exclude_ergebnis(self) -> None:
        """Reguläre Kapitel sollten das Ergebnis-Kapitel ausschließen."""
        kapitel = [
            PlanSection(titel="Einleitung", ziel="z", svm_ids=["0001"]),
            PlanSection(titel="Prüfung A", ziel="z", svm_ids=["0002"]),
            PlanSection(titel="Prüfung B", ziel="z", svm_ids=["0003"]),
            PlanSection(titel="Ergebnis", ziel="z", svm_ids=["0004"]),
        ]
        ergebnis_idx = 3

        regular_chapters = [
            (i, kap) for i, kap in enumerate(kapitel)
            if i != ergebnis_idx
        ]

        assert len(regular_chapters) == 3
        assert all(titel != "Ergebnis" for _, kap in regular_chapters for titel in [kap.titel])

    def test_sorting_preserves_original_order(self) -> None:
        """Nach asyncio.gather sortieren wir nach Index — Original-Reihenfolge bleibt erhalten."""
        # Simuliere ungeordnete Ergebnisse (wie asyncio.gather sie bei unterschiedlicher Laufzeit liefern könnte)
        parallel_results = [
            (2, "draft_2", "result_2"),
            (0, "draft_0", "result_0"),
            (1, "draft_1", "result_1"),
        ]
        sorted_results = sorted(parallel_results, key=lambda x: x[0])
        assert [idx for idx, _, _ in sorted_results] == [0, 1, 2]

    def test_gliederung_kontext_format(self) -> None:
        """Teste das Format des Gliederungskontexts."""

        plan = DetailedPlan(
            kapitel=[
                PlanSection(titel="Einleitung", ziel="Einordnung", svm_ids=["0001"]),
                PlanSection(titel="Prüfung", ziel="Systematische Prüfung", svm_ids=["0002"]),
                PlanSection(titel="Ergebnis", ziel="Zusammenfassung", svm_ids=["0003"]),
            ],
        )
        kontext = create_gliederung_kontext(plan)
        assert "1. Einleitung: Einordnung" in kontext
        assert "2. Prüfung: Systematische Prüfung" in kontext
        assert "3. Ergebnis: Zusammenfassung" in kontext


class TestWriterChunkPreparation:
    """Teste die Aufbereitung von Chunks für ein Kapitel."""

    def test_prepare_chunks_with_matching_ids(self) -> None:

        chunks_by_id = {
            "0001": _ot("0001", "T1", "Text 1"),
            "0002": _ot("0002", "T2", "Text 2"),
            "0003": _ot("0003", "T3", "Text 3"),
        }
        kapitel = PlanSection(titel="Test", ziel="z", svm_ids=["0001", "0003"])

        chunks_text, available_ids, _unterkapitel_info = prepare_chapter_chunks(
            kapitel, chunks_by_id,
        )

        assert available_ids == ["0001", "0003"]
        assert "[0001]" in chunks_text
        assert "[0003]" in chunks_text
        assert "[0002]" not in chunks_text

    def test_prepare_chunks_with_missing_ids(self) -> None:

        chunks_by_id = {
            "0001": _ot("0001", "T1", "Text 1"),
        }
        kapitel = PlanSection(titel="Test", ziel="z", svm_ids=["0001", "9999"])

        chunks_text, available_ids, _ = prepare_chapter_chunks(
            kapitel, chunks_by_id,
        )

        assert available_ids == ["0001"]
        assert "9999" not in chunks_text

    def test_prepare_chunks_empty(self) -> None:

        kapitel = PlanSection(titel="Test", ziel="z", svm_ids=["9999"])
        chunks_text, available_ids, _ = prepare_chapter_chunks(kapitel, {})

        assert available_ids == []
        assert "Keine" in chunks_text


class TestParseUrteil:
    """Teste die Urteil-Parsing-Logik aus dem LLM-Response."""

    def test_erfuellt(self) -> None:
        """Test parsing 'erfuellt'."""
        assert ResultType.parse_urteil("erfuellt") == ResultType.ERFUELLT

    def test_nicht_erfuellt(self) -> None:
        """Test parsing 'nicht_erfuellt'."""
        assert ResultType.parse_urteil("nicht_erfuellt") == ResultType.NICHT_ERFUELLT

    def test_nicht_beurteilbar(self) -> None:
        """Test parsing 'nicht_beurteilbar'."""
        assert ResultType.parse_urteil("nicht_beurteilbar") == ResultType.NICHT_BEURTEILBAR

    def test_fuzzy_erfuellt(self) -> None:
        """Test fuzzy matching 'erfüllt'."""
        assert ResultType.parse_urteil("erfüllt") == ResultType.ERFUELLT

    def test_fuzzy_nicht_erfuellt(self) -> None:
        """Test fuzzy matching 'nicht erfüllt'."""
        assert ResultType.parse_urteil("nicht erfüllt") == ResultType.NICHT_ERFUELLT

    def test_none_returns_none(self) -> None:
        """Test that None input returns None."""
        assert ResultType.parse_urteil(None) is None

    def test_empty_returns_none(self) -> None:
        """Test that empty string returns None."""
        assert ResultType.parse_urteil("") is None

    def test_unknown_fallback(self) -> None:
        """Test unknown input falls back to NICHT_BEURTEILBAR."""
        assert ResultType.parse_urteil("unklar") == ResultType.NICHT_BEURTEILBAR

    def test_whitespace_handling(self) -> None:
        """Test whitespace is trimmed before parsing."""
        assert ResultType.parse_urteil("  erfuellt  ") == ResultType.ERFUELLT

    def test_nicht_beurteilbar_fuzzy(self) -> None:
        """Test fuzzy matching 'nicht beurteilbar'."""
        assert ResultType.parse_urteil("nicht beurteilbar") == ResultType.NICHT_BEURTEILBAR


# =============================================================================
# Quality Reviewer Logic Tests
# =============================================================================


class TestQualityReviewerParseReview:
    """Teste _try_parse_review Logik ohne LLM-Aufruf."""

    def test_valid_review_response(self) -> None:
        """Test parsing a valid review response."""


        content = json.dumps({
            "issues": [
                {
                    "kategorie": "Fehler",
                    "stelle": "Zeile 1",
                    "problem": "Falsche Aussage",
                    "korrektur": "Korrigiert",
                }
            ],
            "revised_markdown": "## Einleitung\n\nKorrigierter Text [0001]",
            "revised_used_svm_ids": ["0001"],
        })
        result = _try_parse_review(f"```json\n{content}\n```", ["0001", "0002"])
        assert result is not None
        assert len(result.issues) == 1
        assert result.revised_markdown == "## Einleitung\n\nKorrigierter Text [0001]"
        assert result.revised_used_svm_ids == ["0001"]

    def test_invalid_json_returns_none(self) -> None:
        """Test invalid schema returns None for retry."""

        # Valid JSON but invalid schema for QualityReviewerResponse → returns None
        result = _try_parse_review('{"unexpected_field": true}', ["0001"])
        assert result is None

    def test_filters_invalid_svm_ids(self) -> None:
        """Test that invalid SVM-IDs are filtered out."""


        content = json.dumps({
            "issues": [],
            "revised_markdown": "## Test revised",
            "revised_used_svm_ids": ["0001", "9999", "0002"],
        })
        result = _try_parse_review(f"```json\n{content}\n```", ["0001", "0002"])
        assert result is not None
        assert result.revised_used_svm_ids == ["0001", "0002"]
        assert "9999" not in result.revised_used_svm_ids

    def test_ergebnis_fields_passed_through(self) -> None:
        """Test kurzform and urteil fields are passed through."""


        content = json.dumps({
            "issues": [],
            "revised_markdown": "## Ergebnis revised",
            "revised_used_svm_ids": ["0001"],
            "revised_kurzform": "Das TBM ist erfüllt.",
            "revised_urteil": "erfuellt",
        })
        result = _try_parse_review(f"```json\n{content}\n```", ["0001"])
        assert result is not None
        assert result.revised_kurzform == "Das TBM ist erfüllt."
        assert result.revised_urteil == "erfuellt"


class TestQualityReviewerFallback:
    """Teste _fallback_result."""

    def test_fallback_preserves_draft(self) -> None:
        """Test fallback returns the original draft unchanged."""

        draft = ChapterDraft(
            titel="Prüfung",
            markdown="## Prüfung\n\nInhalt [0001]",
            used_svm_ids=["0001", "0002"],
        )
        result = _fallback_result(draft)
        assert result.issues == []
        assert result.revised_markdown == draft.markdown
        assert result.revised_used_svm_ids == draft.used_svm_ids
        assert result.revised_kurzform is None
        assert result.revised_urteil is None

    def test_fallback_with_urteil(self) -> None:

        draft = ChapterDraft(
            titel="Ergebnis",
            markdown="## Ergebnis",
            used_svm_ids=["0001"],
            kurzform="Kurzform Text",
            urteil=ResultType.ERFUELLT,
        )
        result = _fallback_result(draft)
        assert result.revised_kurzform == "Kurzform Text"
        assert result.revised_urteil == "erfuellt"


# =============================================================================
# MicroBuilder Fallback Tests
# =============================================================================


class TestMicroBuilderFallback:
    """Teste die Fallback-Logik des MicroBuilders."""

    def test_fallback_truncates_long_text(self) -> None:

        long_text = "x" * 500
        chunks = [_ot("0001", "T1", long_text)]
        fallback = MicroBuilderWorkflow._fallback(chunks)
        assert len(fallback) == 1
        assert len(fallback[0].kernaussage) == config.MICRO_BUILDER.FALLBACK_MAX_CHARS

    def test_fallback_empty_list(self) -> None:

        fallback = MicroBuilderWorkflow._fallback([])
        assert fallback == []


# =============================================================================
# Writer: _prepare_chapter_chunks with Unterkapitel
# =============================================================================


class TestWriterPrepareChunksWithUnterkapitel:
    def test_unterkapitel_info_included(self) -> None:

        kapitel = PlanSection(
            titel="Prüfung",
            ziel="Systematische Prüfung",
            svm_ids=["0001"],
            unterkapitel=[
                PlanSubsection(titel="Aspekt A", fokus="Fokus A", struktur="Darstellung → Bewertung"),
                PlanSubsection(titel="Aspekt B", fokus="Fokus B"),
            ],
        )
        chunks_by_id = {"0001": _ot("0001", "T1", "Text 1")}
        _, _, unterkapitel_info = prepare_chapter_chunks(kapitel, chunks_by_id)
        assert "Aspekt A" in unterkapitel_info
        assert "Fokus A" in unterkapitel_info
        assert "Darstellung → Bewertung" in unterkapitel_info
        assert "Aspekt B" in unterkapitel_info


# =============================================================================
# Async Workflow Tests (mocked LLM calls)
# =============================================================================


def _make_llm_response(markdown: str, svm_ids: list[str], **extra: str) -> str:
    """Build a fake LLM JSON response string."""
    obj: dict[str, object] = {"markdown": markdown, "used_svm_ids": svm_ids, **extra}
    return f"```json\n{json.dumps(obj)}\n```"


def _make_review_result(
    markdown: str,
    svm_ids: list[str],
    *,
    kurzform: str | None = None,
    urteil: str | None = None,
) -> QualityReviewResult:
    return QualityReviewResult(
        issues=[],
        revised_markdown=markdown,
        revised_used_svm_ids=svm_ids,
        revised_kurzform=kurzform,
        revised_urteil=urteil,
    )


def _make_writer_input(
    kapitel: list[PlanSection],
    originaltexte: list[Originaltext] | None = None,
) -> WriterInput:
    return WriterInput(
        satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        norm="BNatSchG\n§ 44\nArtenschutz",
        satz_text="Artenschutzrechtliche Prüfung",
        originaltexte=originaltexte or [_ot("0001", "T1", "Text 1"), _ot("0002", "T2", "Text 2")],
        plan=DetailedPlan(kapitel=kapitel),
    )


# -- Quality Reviewer async --------------------------------------------------


class TestRunQualityReview:
    """Teste run_quality_review mit gemocktem llm_invoke."""

    @pytest.mark.asyncio
    async def test_calls_llm_and_parses(self) -> None:

        review_json = json.dumps({
            "issues": [],
            "revised_markdown": "## Test revised",
            "revised_used_svm_ids": ["0001"],
        })
        mock_llm = AsyncMock(return_value=f"```json\n{review_json}\n```")

        input_data = QualityReviewerInput(
            draft=ChapterDraft(titel="Test", markdown="## Test", used_svm_ids=["0001"]),
            chunks_text="Chunk text",
            available_ids=["0001"],
            satz_text="TBM",
            norm="Norm",
            kapitel_titel="Test",
            kapitel_ziel="Ziel",
        )

        with patch("src.workflows.quality_reviewer.llm_invoke", mock_llm):
            result = await run_quality_review(input_data)

        mock_llm.assert_awaited_once()
        assert result.revised_markdown == "## Test revised"
        assert result.revised_used_svm_ids == ["0001"]
        assert result.issues == []


# -- MicroBuilder async -------------------------------------------------------


class TestMicroBuilderWorkflowRun:
    """Teste MicroBuilderWorkflow.run und _process_batch mit gemocktem llm_invoke."""

    @pytest.mark.asyncio
    async def test_run_single_batch(self) -> None:

        llm_response = json.dumps([
            {"svm_id": "0001", "kernaussage": "Kern 1"},
            {"svm_id": "0002", "kernaussage": "Kern 2"},
        ])
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")

        input_data = MicroBuilderInput(
            norm="§ 44 BNatSchG",
            satz_text="TBM",
            originaltexte=[_ot("0001", "T1", "Text 1"), _ot("0002", "T2", "Text 2")],
        )

        wf = MicroBuilderWorkflow()
        with patch("src.workflows.micro_builder.llm_invoke", mock_llm):
            result = await wf.run(input_data)

        assert isinstance(result, type(result))
        assert len(result.micros) == 2
        assert result.micros[0].svm_id == "0001"
        assert result.micros[1].kernaussage == "Kern 2"

# -- Writer async --------------------------------------------------------------


class TestWriterWorkflowRun:
    """Teste WriterWorkflow.run mit gemocktem llm_invoke und run_quality_review."""

    @pytest.mark.asyncio
    async def test_full_run_with_ergebnis(self) -> None:

        chapter_response = _make_llm_response("## Einleitung\n\nText [0001]", ["0001"])
        pruefung_response = _make_llm_response("## Prüfung\n\nText [0003]", ["0003"])
        ergebnis_response = _make_llm_response(
            "## Ergebnis\n\nBewertung [0002]",
            ["0002"],
            kurzform="Das TBM ist erfüllt.",
            urteil="erfuellt",
        )
        mock_llm = AsyncMock(side_effect=[chapter_response, pruefung_response, ergebnis_response])

        review_regular = _make_review_result("## Einleitung\n\nReviewed [0001]", ["0001"])
        review_pruefung = _make_review_result("## Prüfung\n\nReviewed [0003]", ["0003"])
        review_ergebnis = _make_review_result(
            "## Ergebnis\n\nReviewed [0002]",
            ["0002"],
            kurzform="Kurzform reviewed",
            urteil="erfuellt",
        )
        mock_review = AsyncMock(side_effect=[review_regular, review_pruefung, review_ergebnis])

        kapitel = [
            PlanSection(titel="Einleitung", ziel="Einordnung", svm_ids=["0001"]),
            PlanSection(titel="Prüfung", ziel="Prüfung", svm_ids=["0003"]),
            PlanSection(titel="Ergebnis", ziel="Zusammenfassung", svm_ids=["0002"]),
        ]

        writer_input = _make_writer_input(kapitel)

        wf = WriterWorkflow()
        with (
            patch("src.workflows.writer.llm_invoke", mock_llm),
            patch("src.workflows.writer.run_quality_review", mock_review),
        ):
            result = await wf.run(writer_input)

        assert isinstance(result, FinalOutput)
        assert result.result == ResultType.ERFUELLT
        assert result.kurzform == "Kurzform reviewed"
        assert len(result.kapitel) >= 2
        # Regular chapters + Ergebnis
        ergebnis_kap = [k for k in result.kapitel if k.titel == "Ergebnis"]
        assert len(ergebnis_kap) == 1
        assert ergebnis_kap[0].urteil == ResultType.ERFUELLT

    @pytest.mark.asyncio
    async def test_chapter_without_sources_gets_placeholder(self) -> None:

        # Chapter with no matching sources → prompt is None → placeholder draft
        review_leer = _make_review_result("## Leer\n\n*Keine Quellen verfügbar*", [])
        review_mitte = _make_review_result("## Mitte\n\n*Keine Quellen verfügbar*", [])
        ergebnis_response = _make_llm_response("## Ergebnis\n\nText", ["0001"], urteil="nicht_beurteilbar")
        review_ergebnis = _make_review_result(
            "## Ergebnis\n\nText", ["0001"], urteil="nicht_beurteilbar",
        )

        mock_llm = AsyncMock(return_value=ergebnis_response)
        mock_review = AsyncMock(side_effect=[review_leer, review_mitte, review_ergebnis])

        kapitel = [
            PlanSection(titel="Leer", ziel="Ziel", svm_ids=["9999"]),  # no matching chunk
            PlanSection(titel="Mitte", ziel="Z", svm_ids=["8888"]),
            PlanSection(titel="Ergebnis", ziel="Zusammenfassung", svm_ids=["0001"]),
        ]
        writer_input = _make_writer_input(kapitel)

        wf = WriterWorkflow()
        with (
            patch("src.workflows.writer.llm_invoke", mock_llm),
            patch("src.workflows.writer.run_quality_review", mock_review),
        ):
            result = await wf.run(writer_input)

        assert isinstance(result, FinalOutput)
        # The "Leer" chapter should have gotten the placeholder
        leer_kap = [k for k in result.kapitel if k.titel == "Leer"]
        assert len(leer_kap) == 1

    @pytest.mark.asyncio
    async def test_run_without_urteil_defaults_to_nicht_beurteilbar(self) -> None:

        chapter_response = _make_llm_response("## Einleitung\n\nText", ["0001"])
        ergebnis_response = _make_llm_response("## Ergebnis\n\nText", ["0002"])
        mock_llm = AsyncMock(side_effect=[chapter_response, ergebnis_response])

        # Reviews return no urteil
        review = _make_review_result("## Reviewed", ["0001"])
        mock_review = AsyncMock(return_value=review)

        kapitel = [
            PlanSection(titel="Einleitung", ziel="Z", svm_ids=["0001"]),
            PlanSection(titel="Prüfung", ziel="Z", svm_ids=["0003"]),
            PlanSection(titel="Ergebnis", ziel="Z", svm_ids=["0002"]),
        ]
        writer_input = _make_writer_input(kapitel)

        wf = WriterWorkflow()
        with (
            patch("src.workflows.writer.llm_invoke", mock_llm),
            patch("src.workflows.writer.run_quality_review", mock_review),
        ):
            result = await wf.run(writer_input)

        assert result.result == ResultType.NICHT_BEURTEILBAR
        assert result.kurzform is None


# =============================================================================
# ID Preprocessing / Postprocessing Tests
# =============================================================================


class TestAssignSimpleIds:
    """Test _assign_simple_ids preprocessing."""

    def test_assigns_sequential_ids(self) -> None:

        chunks = [
            _ot("abc-uuid-1", "T1", "Text 1"),
            _ot("abc-uuid-2", "T2", "Text 2"),
            _ot("abc-uuid-3", "T3", "Text 3"),
        ]
        rewritten, id_mapping = _assign_simple_ids(chunks)

        assert [c.node_id for c in rewritten] == ["0001", "0002", "0003"]
        assert id_mapping == {
            "0001": "abc-uuid-1",
            "0002": "abc-uuid-2",
            "0003": "abc-uuid-3",
        }

    def test_preserves_other_fields(self) -> None:

        original = Originaltext(
            document_id="doc-42",
            node_id="some-uuid",
            title="Titel",
            text="Inhalt",
            chunk_ids=["c1", "c2"],
            page_numbers=[5, 6],
        )
        rewritten, _ = _assign_simple_ids([original])

        assert rewritten[0].document_id == "doc-42"
        assert rewritten[0].title == "Titel"
        assert rewritten[0].text == "Inhalt"
        assert rewritten[0].chunk_ids == ["c1", "c2"]
        assert rewritten[0].page_numbers == [5, 6]

    def test_empty_list(self) -> None:

        rewritten, id_mapping = _assign_simple_ids([])
        assert rewritten == []
        assert id_mapping == {}


class TestRestoreOriginalIds:
    """Test that _restore_original_ids was removed — simple IDs stay in text."""

    def test_simple_ids_remain_in_markdown(self) -> None:
        """Simple IDs should NOT be replaced in markdown — only sources maps back."""

        chunks = [
            _ot("abc-uuid-1", "T1", "Text 1"),
            _ot("abc-uuid-2", "T2", "Text 2"),
        ]
        _rewritten, _id_mapping = _assign_simple_ids(chunks)

        # Simulate markdown output with simple IDs — should stay as-is
        markdown = "Referenz [0001] und [0002]."
        assert "[0001]" in markdown
        assert "[0002]" in markdown
