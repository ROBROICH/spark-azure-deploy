"""Tests for BewertungsWorkflow: full pipeline, early-return paths, and postprocessing."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.contracts import (
    BewertungsWorkflowInput,
    BewertungsWorkflowOutput,
    Originaltext,
)

from src.config import config
from src.models.types import (
    ApplicabilityResult,
    ApplicabilityStatus,
    ChapterResult,
    DetailedPlan,
    FinalOutput,
    MicroSummary,
    PlanSection,
    ResultType,
    SvmMicroList,
)
from src.workflows.main_workflow import BewertungsWorkflow, _assign_simple_ids

TEST_UUID = "00000000-0000-4000-8000-000000000001"


def _ot(node_id: str, title: str = "Title", text: str = "Text") -> Originaltext:
    return Originaltext(
        document_id="doc-001",
        node_id=node_id,
        title=title,
        text=text,
        chunk_ids=[f"chunk-{node_id}"],
        page_numbers=[1],
    )


def _workflow_input(n_chunks: int = 10) -> BewertungsWorkflowInput:
    return BewertungsWorkflowInput(
        gesetz="BImSchG",
        jurabk="BImSchG",
        paragraph_nr="22",
        paragraph_title="Pflichten der Betreiber nicht genehmigungsbedürftiger Anlagen",
        paragraph_text="Paragraph text",
        satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        satz_text="Nicht genehmigungsbedürftige Anlagen sind so zu betreiben, dass schädliche Umwelteinwirkungen verhindert werden.",
        originaltexte=[
            _ot(f"uuid-{i:04d}", f"Title {i}", f"Text content for chunk {i}")
            for i in range(1, n_chunks + 1)
        ],
    )


def _plan() -> DetailedPlan:
    return DetailedPlan(kapitel=[
        PlanSection(titel="Einleitung", ziel="Überblick", svm_ids=["0001", "0002"]),
        PlanSection(titel="Prüfung", ziel="Analyse", svm_ids=["0003", "0004"]),
        PlanSection(titel="Ergebnis", ziel="Bewertung", svm_ids=["0005"]),
    ])


def _final_output() -> FinalOutput:
    return FinalOutput(
        satz_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        norm="§ 22 BImSchG - Pflichten der Betreiber",
        satz_text="TBM text",
        result=ResultType.ERFUELLT,
        kurzform="Das Tatbestandsmerkmal ist erfüllt.",
        plan=_plan(),
        kapitel=[
            ChapterResult(
                titel="Einleitung",
                markdown="## Einleitung\n\nText [0001] [0002].",
                used_svm_ids=["0001", "0002"],
            ),
            ChapterResult(
                titel="Prüfung",
                markdown="## Prüfung\n\nAnalyse [0003] [0004].",
                used_svm_ids=["0003", "0004"],
            ),
            ChapterResult(
                titel="Ergebnis",
                markdown="## Ergebnis\n\nBewertung [0005].",
                used_svm_ids=["0005"],
                kurzform="Erfüllt.",
                urteil=ResultType.ERFUELLT,
            ),
        ],
    )


# =============================================================================
# _assign_simple_ids (already has some tests; adding edge cases here)
# =============================================================================


class TestAssignSimpleIds:
    """Tests for _assign_simple_ids helper."""

    def test_sequential_ids_start_at_0001(self) -> None:

        chunks = [_ot("uuid-a"), _ot("uuid-b"), _ot("uuid-c")]
        rewritten, id_mapping = _assign_simple_ids(chunks)

        assert [c.node_id for c in rewritten] == ["0001", "0002", "0003"]
        assert id_mapping == {"0001": "uuid-a", "0002": "uuid-b", "0003": "uuid-c"}

    def test_preserves_document_id_and_text(self) -> None:

        chunks = [_ot("uuid-x", "My Title", "My Text")]
        rewritten, _ = _assign_simple_ids(chunks)

        assert rewritten[0].document_id == "doc-001"
        assert rewritten[0].title == "My Title"
        assert rewritten[0].text == "My Text"
        assert rewritten[0].chunk_ids == ["chunk-uuid-x"]


# =============================================================================
# _build_insufficient_fundstellen_output — early return for < MIN_FUNDSTELLEN
# =============================================================================


class TestInsufficientFundstellenOutput:
    """Tests for BewertungsWorkflow._build_insufficient_fundstellen_output."""

    @pytest.mark.asyncio
    async def test_returns_nicht_beurteilbar(self) -> None:

        inp = _workflow_input(n_chunks=config.MIN_FUNDSTELLEN - 2)
        wf = BewertungsWorkflow()

        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = wf._build_insufficient_fundstellen_output(
                inp, "§ 22 BImSchG - Pflichten",
            )

        assert result.result == "nicht_beurteilbar"
        assert result.kurzform is not None
        assert "Fundstellen" in result.kurzform
        assert len(result.kapitel) == 0

    @pytest.mark.asyncio
    async def test_sources_use_sequential_ids(self) -> None:

        inp = _workflow_input(n_chunks=3)
        wf = BewertungsWorkflow()

        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = wf._build_insufficient_fundstellen_output(
                inp, "§ 22 BImSchG - Pflichten",
            )

        assert "0001" in result.sources
        assert "0002" in result.sources
        assert "0003" in result.sources
        # Sources should map back to original node_ids
        assert result.sources["0001"].node_id == "uuid-0001"


# =============================================================================
# _build_precheck_skip_output — early return for skipped TBM
# =============================================================================


class TestPrecheckSkipOutput:
    """Tests for BewertungsWorkflow._build_precheck_skip_output."""

    @pytest.mark.asyncio
    async def test_returns_nicht_beurteilbar_with_begruendung(self) -> None:

        inp = _workflow_input(n_chunks=10)
        preprocessed = [
            Originaltext(
                document_id="doc-001", node_id=f"{i:04d}",
                title=f"T{i}", text=f"Text {i}",
                chunk_ids=[f"chunk-{i}"], page_numbers=[1],
            )
            for i in range(1, 11)
        ]
        id_mapping = {f"{i:04d}": f"uuid-{i:04d}" for i in range(1, 11)}

        applicability = ApplicabilityResult(
            status=ApplicabilityStatus.UEBERSPRINGEN,
            begruendung_markdown="## Vorfilter\n\nNicht anwendbar.",
            kurzform="Das TBM ist nicht anwendbar.",
        )

        wf = BewertungsWorkflow()
        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = wf._build_precheck_skip_output(
                inp, "§ 22 BImSchG", applicability, preprocessed, id_mapping,
            )

        assert result.result == "nicht_beurteilbar"
        assert result.kurzform == "Das TBM ist nicht anwendbar."
        assert len(result.kapitel) == 1
        assert result.kapitel[0].titel == "Zusammenfassung"

    @pytest.mark.asyncio
    async def test_without_begruendung_no_kapitel(self) -> None:

        inp = _workflow_input(n_chunks=10)
        preprocessed = [
            Originaltext(
                document_id="doc-001", node_id=f"{i:04d}",
                title=f"T{i}", text=f"Text {i}",
            )
            for i in range(1, 11)
        ]
        id_mapping = {f"{i:04d}": f"uuid-{i:04d}" for i in range(1, 11)}

        applicability = ApplicabilityResult(
            status=ApplicabilityStatus.UEBERSPRINGEN,
            begruendung_markdown=None,
            kurzform=None,
        )

        wf = BewertungsWorkflow()
        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = wf._build_precheck_skip_output(
                inp, "§ 22 BImSchG", applicability, preprocessed, id_mapping,
            )

        assert result.result == "nicht_beurteilbar"
        assert len(result.kapitel) == 0
        assert "nicht anwendbar" in result.full_text

    @pytest.mark.asyncio
    async def test_sources_map_back_to_original_ids(self) -> None:

        inp = _workflow_input(n_chunks=5)
        preprocessed = [
            Originaltext(
                document_id="doc-001", node_id=f"{i:04d}",
                title=f"T{i}", text=f"Text {i}",
            )
            for i in range(1, 6)
        ]
        id_mapping = {f"{i:04d}": f"original-uuid-{i}" for i in range(1, 6)}

        applicability = ApplicabilityResult(
            status=ApplicabilityStatus.UEBERSPRINGEN,
            begruendung_markdown="Grund",
            kurzform="Kurz",
        )

        wf = BewertungsWorkflow()
        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = wf._build_precheck_skip_output(
                inp, "§ 22 BImSchG", applicability, preprocessed, id_mapping,
            )

        # Quellen should use original UUIDs
        assert result.sources["0001"].node_id == "original-uuid-1"
        assert result.sources["0005"].node_id == "original-uuid-5"


# =============================================================================
# Full pipeline — BewertungsWorkflow.run with mocked child workflows
# =============================================================================


class TestBewertungsWorkflowRun:
    """Tests for the full BewertungsWorkflow.run pipeline with mocked child workflows."""

    @pytest.mark.asyncio
    async def test_insufficient_fundstellen_returns_early(self) -> None:

        inp = _workflow_input(n_chunks=config.MIN_FUNDSTELLEN - 2)

        wf = BewertungsWorkflow()
        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = await wf.run(inp)

        assert isinstance(result, BewertungsWorkflowOutput)
        assert result.result == "nicht_beurteilbar"
        assert result.kurzform is not None
        assert "Fundstellen" in result.kurzform

    @pytest.mark.asyncio
    async def test_nicht_anwendbar_returns_early(self) -> None:

        inp = _workflow_input(n_chunks=10)
        micros = SvmMicroList(
            satz_text=inp.satz_text,
            micros=[MicroSummary(svm_id=f"{i:04d}", kernaussage=f"K{i}") for i in range(1, 11)],
        )
        applicability = ApplicabilityResult(
            status=ApplicabilityStatus.UEBERSPRINGEN,
            begruendung_markdown="## Begründung\n\nNicht anwendbar.",
            kurzform="Nicht anwendbar auf das Vorhaben.",
        )

        # execute_child_workflow is called for MicroBuilder then Applicability
        mock_child_wf = AsyncMock(side_effect=[micros, applicability])

        wf = BewertungsWorkflow()
        with (
            patch("temporalio.workflow.execute_child_workflow", mock_child_wf),
            patch("temporalio.workflow.uuid4", return_value=TEST_UUID),
        ):
            result = await wf.run(inp)

        assert result.result == "nicht_beurteilbar"
        assert result.kurzform == "Nicht anwendbar auf das Vorhaben."
        assert len(result.kapitel) == 1
        assert result.kapitel[0].titel == "Zusammenfassung"
        # Only 2 child workflows called (MicroBuilder + Applicability), not Planner/Writer
        assert mock_child_wf.await_count == 2

    @pytest.mark.asyncio
    async def test_full_pipeline_success(self) -> None:

        inp = _workflow_input(n_chunks=10)
        micros = SvmMicroList(
            satz_text=inp.satz_text,
            micros=[MicroSummary(svm_id=f"{i:04d}", kernaussage=f"K{i}") for i in range(1, 11)],
        )
        applicability = ApplicabilityResult(
            status=ApplicabilityStatus.BEWERTEN,
        )
        plan = _plan()
        final = _final_output()

        # MicroBuilder → Applicability → Planner → Writer
        mock_child_wf = AsyncMock(side_effect=[micros, applicability, plan, final])

        wf = BewertungsWorkflow()
        with (
            patch("temporalio.workflow.execute_child_workflow", mock_child_wf),
            patch("temporalio.workflow.uuid4", return_value=TEST_UUID),
        ):
            result = await wf.run(inp)

        assert isinstance(result, BewertungsWorkflowOutput)
        assert result.result == "erfuellt"
        assert result.satz_id == "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        assert len(result.kapitel) == 3
        assert result.kapitel[0].titel == "Einleitung"
        assert result.kapitel[2].titel == "Ergebnis"
        # All 4 child workflows called
        assert mock_child_wf.await_count == 4

    @pytest.mark.asyncio
    async def test_sources_mapped_back_to_original_ids(self) -> None:

        inp = _workflow_input(n_chunks=10)
        micros = SvmMicroList(
            satz_text=inp.satz_text,
            micros=[MicroSummary(svm_id=f"{i:04d}", kernaussage=f"K{i}") for i in range(1, 11)],
        )
        applicability = ApplicabilityResult(status=ApplicabilityStatus.BEWERTEN)
        plan = _plan()
        final = _final_output()

        mock_child_wf = AsyncMock(side_effect=[micros, applicability, plan, final])

        wf = BewertungsWorkflow()
        with (
            patch("temporalio.workflow.execute_child_workflow", mock_child_wf),
            patch("temporalio.workflow.uuid4", return_value=TEST_UUID),
        ):
            result = await wf.run(inp)

        # Sources should map simple IDs back to original UUIDs
        for _sid, quelle in result.sources.items():
            assert quelle.node_id.startswith("uuid-")

    @pytest.mark.asyncio
    async def test_norm_format(self) -> None:

        inp = _workflow_input(n_chunks=3)

        wf = BewertungsWorkflow()
        with patch("temporalio.workflow.uuid4", return_value=TEST_UUID):
            result = await wf.run(inp)

        assert result.norm == "§ 22 BImSchG - Pflichten der Betreiber nicht genehmigungsbedürftiger Anlagen"

    @pytest.mark.asyncio
    async def test_full_text_generated(self) -> None:

        inp = _workflow_input(n_chunks=10)
        micros = SvmMicroList(
            satz_text=inp.satz_text,
            micros=[MicroSummary(svm_id=f"{i:04d}", kernaussage=f"K{i}") for i in range(1, 11)],
        )
        applicability = ApplicabilityResult(status=ApplicabilityStatus.BEWERTEN)
        plan = _plan()
        final = _final_output()

        mock_child_wf = AsyncMock(side_effect=[micros, applicability, plan, final])

        wf = BewertungsWorkflow()
        with (
            patch("temporalio.workflow.execute_child_workflow", mock_child_wf),
            patch("temporalio.workflow.uuid4", return_value=TEST_UUID),
        ):
            result = await wf.run(inp)

        assert result.full_text  # Should be a non-empty string
        assert isinstance(result.full_text, str)
