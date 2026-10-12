# ruff: noqa: PLC0415
"""Tests for NormDekonstruktionWorkflow logic (branching in _process_satz and _get_tbms_and_rf)."""

from unittest.mock import AsyncMock, patch

import pytest
from fixtures.bnatschg_44 import (
    SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE,
    SATZ_1_NR_1_TATBESTANDSMERKMALE,
    SATZ_1_NR_1_TEXT,
)

from src.absatz import Absatz
from src.workflows.norm_workflow.norm_main_workflow import NormDekonstruktionWorkflow
from src.workflows.norm_workflow.norm_types import (
    NormDekonstruktionWorkflowInput,
    NormDekonstruktionWorkflowSatzInput,
)

_PATCH_CHILD = "temporalio.workflow.execute_child_workflow"
_PATCH_GATHER = "src.workflows.norm_workflow.norm_main_workflow.asyncio.gather"


@pytest.fixture
def satz() -> NormDekonstruktionWorkflowSatzInput:
    return NormDekonstruktionWorkflowSatzInput(
        satz_nr="1",
        markers=["§ 4 Abs. 1 S. 1"],
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
    )


@pytest.fixture
def norm_input(satz: NormDekonstruktionWorkflowSatzInput) -> NormDekonstruktionWorkflowInput:
    return NormDekonstruktionWorkflowInput(
        gesetz="Bundes-Immissionsschutzgesetz",
        jurabk="BImSchG",
        standangaben=[],
        paragraph_nr="4",
        paragraph_titel="Genehmigung",
        paragraph_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        absaetze=[
            Absatz(
                absatz_nr="1",
                absatz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
                saetze=[satz],
            )
        ],
    )


class TestProcessSatz:
    async def test_verfahrensrechtlich_skips_lvl2(self, satz: NormDekonstruktionWorkflowSatzInput) -> None:
        """Tests if a verfahrensrechtlich norm type causes level-2 processing to be skipped."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = "verfahrensrechtlich"
            result = await NormDekonstruktionWorkflow._process_satz(satz)

        assert result.norm_typ_lvl1 == "verfahrensrechtlich"
        assert result.norm_typ_lvl2 is None
        assert result.tatbestandsmerkmale is None
        assert result.rechtsfolge is None

    async def test_materiell_sonstiges_skips_tbm_extraction(self, satz: NormDekonstruktionWorkflowSatzInput) -> None:
        """Tests if a materiell-rechtlich norm with sonstiges kategorie skips TBM extraction."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = ["materiell-rechtlich", "sonstiges"]
            result = await NormDekonstruktionWorkflow._process_satz(satz)

        assert result.norm_typ_lvl1 == "materiell-rechtlich"
        assert result.norm_typ_lvl2 == "sonstiges"
        assert result.tatbestandsmerkmale is None

    async def test_wenn_dann_with_empty_tbms_falls_back_to_sonstiges(
        self, satz: NormDekonstruktionWorkflowSatzInput
    ) -> None:
        """Tests if a wenn-dann norm with empty TBMs falls back to norm_typ_lvl2 'sonstiges'."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            # norm_typ → materiell, satz_kategorie → wenn-dann, praedikatenlogik → empty TBMs
            empty_tbms: list[str] = []
            mock_child.side_effect = ["materiell-rechtlich", "wenn-dann", (empty_tbms, ["Rechtsfolge"])]
            result = await NormDekonstruktionWorkflow._process_satz(satz)

        assert result.norm_typ_lvl2 == "sonstiges"
        assert result.tatbestandsmerkmale is None

    async def test_wenn_dann_with_empty_rechtsfolgen_falls_back_to_sonstiges(
        self, satz: NormDekonstruktionWorkflowSatzInput
    ) -> None:
        """Tests if a wenn-dann norm with empty Rechtsfolgen falls back to norm_typ_lvl2 'sonstiges'."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_rf: list[str] = []
            mock_child.side_effect = ["materiell-rechtlich", "wenn-dann", (["TBM"], empty_rf)]
            result = await NormDekonstruktionWorkflow._process_satz(satz)

        assert result.norm_typ_lvl2 == "sonstiges"
        assert result.tatbestandsmerkmale is None

    async def test_preserves_satz_metadata(self, satz: NormDekonstruktionWorkflowSatzInput) -> None:
        """Tests if Satz metadata (satz_nr, markers, satz_text) is preserved in the output."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = "verfahrensrechtlich"
            result = await NormDekonstruktionWorkflow._process_satz(satz)

        assert result.satz_nr == satz.satz_nr
        assert result.markers == satz.markers
        assert result.satz_text == satz.satz_text


class TestGetTbmsAndRf:
    async def test_returns_is_empty_true_when_tbms_empty(self) -> None:
        """Tests if is_empty is True when the TBMs list returned by the LLM is empty."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_tbms: list[str] = []
            mock_child.return_value = (empty_tbms, ["Rechtsfolge"])
            _, _, _, is_empty = await NormDekonstruktionWorkflow._get_tbms_and_rf("Ein Satz.")

        assert is_empty is True

    async def test_returns_is_empty_true_when_rechtsfolgen_empty(self) -> None:
        """Tests if is_empty is True when the Rechtsfolgen list returned by the LLM is empty."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_rf: list[str] = []
            mock_child.return_value = (["TBM"], empty_rf)
            _, _, _, is_empty = await NormDekonstruktionWorkflow._get_tbms_and_rf("Ein Satz.")

        assert is_empty is True

    async def test_returns_is_empty_true_when_tbms_whitespace_only(self) -> None:
        """Tests if is_empty is True when all TBMs in the list are whitespace-only strings."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = (["  ", ""], ["Rechtsfolge"])
            _, _, _, is_empty = await NormDekonstruktionWorkflow._get_tbms_and_rf("Ein Satz.")

        assert is_empty is True

    @pytest.mark.parametrize(
        "tbms,rechtsfolgen",
        [
            (["TBM A"], ["Rechtsfolge X"]),
            (["TBM A", "TBM B"], ["Rechtsfolge X"]),
        ],
    )
    async def test_returns_is_empty_false_when_both_present(self, tbms: list[str], rechtsfolgen: list[str]) -> None:
        """Tests if is_empty is False when both TBMs and Rechtsfolgen are present."""
        atomare = ["Atomares TBM A"]
        rechtsfolge_neu = "Konstruierte Rechtsfolge."
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = [(tbms, rechtsfolgen), atomare, rechtsfolge_neu]
            with patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
                mock_gather.return_value = (atomare, rechtsfolge_neu)
                result_tbms, _result_rf, _result_atomare, is_empty = await NormDekonstruktionWorkflow._get_tbms_and_rf(
                    "Ein Satz."
                )

        assert is_empty is False
        assert result_tbms == tbms


class TestGetTbmsAndRfWithRealData:
    """Tests using real BNatSchG § 44 production TBM data."""

    async def test_real_bnatschg_tbms_not_empty(self) -> None:
        """Tests if the BNatSchG § 44 Satz 1 TBMs are not empty and match the expected atomare TBMs."""
        rechtsfolge_neu = "Es ist verboten."
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = [
                (SATZ_1_NR_1_TATBESTANDSMERKMALE, ["Es ist verboten."]),
            ]
            with patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
                mock_gather.return_value = (SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE, rechtsfolge_neu)
                _, _, result_atomare, is_empty = await NormDekonstruktionWorkflow._get_tbms_and_rf(SATZ_1_NR_1_TEXT)

        assert is_empty is False
        assert result_atomare == SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE

    async def test_real_process_satz_wenn_dann(self) -> None:
        """Tests if processing BNatSchG § 44 Satz 1 yields materiell-rechtlich/wenn-dann with the expected atomare TBMs."""
        satz = NormDekonstruktionWorkflowSatzInput(
            satz_nr="1",
            markers=["§ 44 Abs. 1 S. 1"],
            satz_text=SATZ_1_NR_1_TEXT,
        )
        rechtsfolge_neu = "Es ist verboten."
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = [
                "materiell-rechtlich",
                "wenn-dann",
                (SATZ_1_NR_1_TATBESTANDSMERKMALE, ["Es ist verboten."]),
            ]
            with patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
                mock_gather.return_value = (SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE, rechtsfolge_neu)
                result = await NormDekonstruktionWorkflow._process_satz(satz)

        assert result.norm_typ_lvl1 == "materiell-rechtlich"
        assert result.norm_typ_lvl2 == "wenn-dann"
        assert result.atomare_tatbestandsmerkmale == SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE


class TestRun:
    """Tests for the top-level NormDekonstruktionWorkflow.run() orchestrator."""

    async def test_empty_paragraph_text_returns_empty_output(self, norm_input: NormDekonstruktionWorkflowInput) -> None:
        """Tests if an empty paragraph_text results in no absaetze and no regelungsgegenstand."""
        empty_input = norm_input.model_copy(update={"paragraph_text": ""})

        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            result = await NormDekonstruktionWorkflow().run(empty_input)

        mock_child.assert_not_called()
        assert result.absaetze == []
        assert result.regelungsgegenstand is None

    async def test_preserves_input_metadata(self, norm_input: NormDekonstruktionWorkflowInput) -> None:
        """Tests if input metadata (gesetz, jurabk, paragraph_nr, etc.) is passed through to the output."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = "Regelungsgegenstand"
            with patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
                mock_gather.return_value = [
                    norm_input.absaetze[0].saetze[0]  # dummy, won't be used
                ]
                # _process_satz is called via gather, so we patch it directly
                with patch.object(NormDekonstruktionWorkflow, "_process_satz", new_callable=AsyncMock) as mock_process:
                    from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowSatzOutput

                    mock_process.return_value = NormDekonstruktionWorkflowSatzOutput(
                        satz_nr="1",
                        markers=["§ 4 Abs. 1 S. 1"],
                        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
                        norm_typ_lvl1="verfahrensrechtlich",
                    )
                    mock_gather.return_value = [mock_process.return_value]
                    result = await NormDekonstruktionWorkflow().run(norm_input)

        assert result.gesetz == norm_input.gesetz
        assert result.jurabk == norm_input.jurabk
        assert result.paragraph_nr == norm_input.paragraph_nr
        assert result.paragraph_titel == norm_input.paragraph_titel
        assert result.paragraph_text == norm_input.paragraph_text
        assert result.standangaben == norm_input.standangaben
        assert result.regelungsgegenstand == "Regelungsgegenstand"

    async def test_calls_regelungsgegenstand_and_processes_saetze(
        self, norm_input: NormDekonstruktionWorkflowInput
    ) -> None:
        """Tests if run() calls the Regelungsgegenstand child workflow and processes all sentences."""
        from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowSatzOutput

        satz_output = NormDekonstruktionWorkflowSatzOutput(
            satz_nr="1",
            markers=["§ 4 Abs. 1 S. 1"],
            satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
            norm_typ_lvl1="materiell-rechtlich",
            norm_typ_lvl2="wenn-dann",
            tatbestandsmerkmale=["Betreiben einer Anlage"],
            rechtsfolge="bedarf einer Genehmigung",
            atomare_tatbestandsmerkmale=["Betreiben einer Anlage"],
        )

        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = "Schutz der Umwelt"
            with patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
                mock_gather.return_value = [satz_output]
                with patch.object(NormDekonstruktionWorkflow, "_process_satz", new_callable=AsyncMock) as mock_process:
                    mock_process.return_value = satz_output
                    result = await NormDekonstruktionWorkflow().run(norm_input)

        assert result.regelungsgegenstand == "Schutz der Umwelt"
        assert len(result.absaetze) == 1
        assert result.absaetze[0].absatz_nr == "1"
        assert result.absaetze[0].saetze == [satz_output]
