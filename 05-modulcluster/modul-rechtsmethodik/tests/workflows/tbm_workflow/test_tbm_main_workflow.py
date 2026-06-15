# ruff: noqa: PLR2004
"""Tests for TatbestandsAnalyseWorkflow branching logic and assembly functions."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.workflows.rechtsmethodik.types import WENN_DANN, AtomaresTBM, Rechtsbegriffe, SatzKategorie, Verweise

from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowSatzOutput
from src.workflows.tbm_workflow.pruefformulierung.pf_data_format import Pruefformulierung
from src.workflows.tbm_workflow.tbm_main_workflow import TatbestandsAnalyseWorkflow, _assemble_atomare_tbms

_PATCH_RUN_CHILD = "src.workflows.tbm_workflow.tbm_main_workflow.TatbestandsAnalyseWorkflow._run_child_workflows"

_COMMON = {
    "gesetz": "BImSchG",
    "jurabk": "BImSchG",
    "paragraph_nr": "4",
    "paragraph_text": "Ein Paragraph.",
    "absatz_nr": "1",
}


def _make_satz(
    norm_typ_lvl_2: SatzKategorie | None = WENN_DANN,
    atomare: list[str] | None = None,
    rechtsfolge: str | None = None,
) -> NormDekonstruktionWorkflowSatzOutput:
    return NormDekonstruktionWorkflowSatzOutput(
        satz_nr="1",
        markers=["§ 4 Abs. 1 S. 1"],
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        norm_typ_lvl_1="materiell-rechtlich",
        norm_typ_lvl_2=norm_typ_lvl_2,
        atomare_tatbestandsmerkmale=atomare,
        rechtsfolge=rechtsfolge,
    )


def _make_verweise() -> Verweise:
    return Verweise(explizit=[], implizit=[])


def _make_rechtsbegriffe() -> Rechtsbegriffe:
    return Rechtsbegriffe(bestimmte_rechtsbegriffe=[], unbestimmte_rechtsbegriffe=[])


class TestProcessSatzBranching:
    async def test_non_wenn_dann_skips_child_workflows(self) -> None:
        """Tests if non-WENN_DANN Sätze skip child workflow execution."""
        satz = _make_satz(norm_typ_lvl_2="sonstiges")
        with patch(_PATCH_RUN_CHILD, new_callable=AsyncMock) as mock_run:
            result = await TatbestandsAnalyseWorkflow._process_satz(**_COMMON, satz=satz)
        mock_run.assert_not_called()
        assert result.atomare_tatbestandsmerkmale is None
        assert result.rechtsfolge is None
        assert result.formel is None

    async def test_wenn_dann_no_tbms_and_no_rf_skips_child_workflows(self) -> None:
        """Tests if WENN_DANN Sätze without TBMs and Rechtsfolge skip child workflow execution."""
        satz = _make_satz(norm_typ_lvl_2=WENN_DANN, atomare=None, rechtsfolge=None)
        with patch(_PATCH_RUN_CHILD, new_callable=AsyncMock) as mock_run:
            result = await TatbestandsAnalyseWorkflow._process_satz(**_COMMON, satz=satz)
        mock_run.assert_not_called()
        assert result.atomare_tatbestandsmerkmale is None

    async def test_wenn_dann_with_tbms_and_rf_calls_run_child_workflows(self) -> None:
        """Tests if WENN_DANN Sätze with TBMs and Rechtsfolge trigger child workflow execution."""
        satz = _make_satz(norm_typ_lvl_2=WENN_DANN, atomare=["TBM A"], rechtsfolge="Genehmigung erteilen.")
        with patch(_PATCH_RUN_CHILD, new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (None, None, None)
            await TatbestandsAnalyseWorkflow._process_satz(**_COMMON, satz=satz)
        mock_run.assert_called_once()

    async def test_base_output_preserves_satz_metadata(self) -> None:
        """Tests if the base output preserves the Satz metadata unchanged."""
        satz = _make_satz(norm_typ_lvl_2="sonstiges")
        result = await TatbestandsAnalyseWorkflow._process_satz(**_COMMON, satz=satz)
        assert result.satz_nr == satz.satz_nr
        assert result.satz_text == satz.satz_text
        assert result.norm_typ_lvl_2 == "sonstiges"

    @pytest.mark.parametrize(
        "atomare,rechtsfolge,expects_call",
        [
            (["TBM A"], "RF X", True),
            (["TBM A"], None, True),
            (None, "RF X", True),
            (None, None, False),
        ],
    )
    async def test_child_workflow_call_depends_on_both_tbms_and_rf(
        self, atomare: list[str] | None, rechtsfolge: str | None, expects_call: bool
    ) -> None:
        """Tests if child workflow execution is triggered when either TBMs or Rechtsfolge is present."""
        satz = _make_satz(norm_typ_lvl_2=WENN_DANN, atomare=atomare, rechtsfolge=rechtsfolge)
        with patch(_PATCH_RUN_CHILD, new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (None, None, None)
            await TatbestandsAnalyseWorkflow._process_satz(**_COMMON, satz=satz)
        assert mock_run.called == expects_call


class TestAssembleAtmareTbms:
    def test_output_length_matches_input(self) -> None:
        """Tests if the output length matches the number of input TBMs."""
        a_tbms = ["TBM A", "TBM B"]
        pf = [
            Pruefformulierung(id="0", prueffrage="Frage A", pruefgegenstand="G A"),
            Pruefformulierung(id="1", prueffrage="Frage B", pruefgegenstand="G B"),
        ]
        result = _assemble_atomare_tbms(
            a_tbms,
            [_make_verweise(), _make_verweise()],
            pf,
            [_make_rechtsbegriffe(), _make_rechtsbegriffe()],
        )
        assert len(result) == 2

    def test_text_assigned_from_a_tbm(self) -> None:
        """Tests if the text field is assigned from the atomare TBM string."""
        result = _assemble_atomare_tbms(
            ["Betreiben einer Anlage"],
            [_make_verweise()],
            [Pruefformulierung(id="0", prueffrage="Wird betrieben?", pruefgegenstand="Anlage")],
            [_make_rechtsbegriffe()],
        )
        assert result[0].text == "Betreiben einer Anlage"

    def test_prueffrage_assigned_per_index(self) -> None:
        """Tests if Prüffragen are assigned to the correct TBM by index."""
        pf = [
            Pruefformulierung(id="0", prueffrage="Frage 0", pruefgegenstand="G"),
            Pruefformulierung(id="1", prueffrage="Frage 1", pruefgegenstand="G"),
        ]
        result = _assemble_atomare_tbms(
            ["TBM 0", "TBM 1"],
            [_make_verweise(), _make_verweise()],
            pf,
            [_make_rechtsbegriffe(), _make_rechtsbegriffe()],
        )
        assert result[0].prueffrage == "Frage 0"
        assert result[1].prueffrage == "Frage 1"

    def test_returns_atomare_tbm_instances(self) -> None:
        """Tests if the result contains AtomaresTBM instances."""
        result = _assemble_atomare_tbms(
            ["TBM"],
            [_make_verweise()],
            [Pruefformulierung(id="0", prueffrage="F", pruefgegenstand="G")],
            [_make_rechtsbegriffe()],
        )
        assert isinstance(result[0], AtomaresTBM)


class TestAssembleSatzResults:
    """Tests for _assemble_satz_results unpacking and assembly logic."""

    def _make_results(
        self,
        pf: list[Pruefformulierung] | None = None,
        verweis_tbms: list[Verweise] | None = None,
        verweis_rf: Verweise | None = None,
        rechtsbegriffe: list[Rechtsbegriffe] | None = None,
        fe: str | None = None,
    ) -> list[object]:
        return [
            pf or [],
            (verweis_tbms or [_make_verweise()], verweis_rf or _make_verweise()),
            rechtsbegriffe or [_make_rechtsbegriffe()],
            fe,
        ]

    def test_returns_none_when_no_atomare(self) -> None:
        """When satz has no atomare_tatbestandsmerkmale, final_a_tbms is None."""
        satz = _make_satz(atomare=None, rechtsfolge="RF")
        results = self._make_results()
        final_a_tbms, _, _ = TatbestandsAnalyseWorkflow._assemble_satz_results(results, satz)
        assert final_a_tbms is None

    def test_returns_none_rf_when_no_rechtsfolge(self) -> None:
        """When satz has no rechtsfolge, final_rf is None."""
        satz = _make_satz(atomare=["TBM A"], rechtsfolge=None)
        results = self._make_results(
            pf=[Pruefformulierung(id="0", prueffrage="F", pruefgegenstand="G")],
        )
        _, final_rf, _ = TatbestandsAnalyseWorkflow._assemble_satz_results(results, satz)
        assert final_rf is None

    def test_assembles_tbms_when_present(self) -> None:
        """When satz has atomare_tatbestandsmerkmale, assembles AtomaresTBM list."""
        satz = _make_satz(atomare=["TBM A"], rechtsfolge="RF")
        results = self._make_results(
            pf=[Pruefformulierung(id="0", prueffrage="F", pruefgegenstand="G")],
        )
        final_a_tbms, _, _ = TatbestandsAnalyseWorkflow._assemble_satz_results(results, satz)
        assert final_a_tbms is not None
        assert len(final_a_tbms) == 1
        assert final_a_tbms[0].text == "TBM A"

    def test_rechtsfolge_includes_verweise(self) -> None:
        """When rechtsfolge is present, final_rf includes verweis_rf."""
        satz = _make_satz(atomare=["TBM A"], rechtsfolge="Genehmigung erteilen.")
        rf_verweise = Verweise(explizit=[], implizit=["§ 5 Abs. 1"])
        results = self._make_results(
            pf=[Pruefformulierung(id="0", prueffrage="F", pruefgegenstand="G")],
            verweis_rf=rf_verweise,
        )
        _, final_rf, _ = TatbestandsAnalyseWorkflow._assemble_satz_results(results, satz)
        assert final_rf is not None
        assert final_rf.text == "Genehmigung erteilen."
        assert final_rf.verweise == rf_verweise

    def test_fe_output_passed_through(self) -> None:
        """fe_output is returned as-is from results."""
        satz = _make_satz(atomare=None, rechtsfolge=None)
        results = self._make_results(fe="WENN x DANN y")
        _, _, fe = TatbestandsAnalyseWorkflow._assemble_satz_results(results, satz)
        assert fe == "WENN x DANN y"


class TestBuildWorkflowTasks:
    """Tests for _build_workflow_tasks conditional task creation."""

    async def test_no_atomare_returns_noop_for_pf_and_rechtsbegriffe(self) -> None:
        """When satz has no atomare_tatbestandsmerkmale, pf and rechtsbegriffe tasks are noops."""
        satz = _make_satz(atomare=None, rechtsfolge=None)
        with patch("src.workflows.tbm_workflow.tbm_main_workflow.workflow"):
            pf_task, _, rb_task, fe_task = TatbestandsAnalyseWorkflow._build_workflow_tasks(
                satz,
                **_COMMON,  # type: ignore[arg-type]
            )
        # pf and rechtsbegriffe return empty lists, fe returns None
        assert await pf_task == []
        assert await rb_task == []
        assert await fe_task is None

    async def test_atomare_but_no_rf_returns_noop_for_fe(self) -> None:
        """When satz has atomare but no rechtsfolge, fe task is a noop."""
        satz = _make_satz(atomare=["TBM A"], rechtsfolge=None)
        with patch("src.workflows.tbm_workflow.tbm_main_workflow.workflow") as mock_wf:
            mock_wf.execute_child_workflow.return_value = AsyncMock()()
            _, _, _, fe_task = TatbestandsAnalyseWorkflow._build_workflow_tasks(
                satz,
                **_COMMON,  # type: ignore[arg-type]
            )
        assert await fe_task is None
