"""Tests for VerweisImplizitAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.verweis.verweis_implizit.vi import VerweisImplizitAgentWorkflow
from src.workflows.tbm_workflow.verweis.verweis_implizit.vi_data_format import VerweisAgentOutputImplizit
from src.workflows.tbm_workflow.verweis.verweis_types import VerweisAgentInputImplizit

_PATCH = "src.workflows.tbm_workflow.verweis.verweis_implizit.vi.llm_invoke"


@pytest.fixture
def workflow_input() -> VerweisAgentInputImplizit:
    return VerweisAgentInputImplizit(
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung nach § 4 BImSchG.",
        atomare_tatbestandsmerkmale=["Betreiben einer Anlage nach § 4 BImSchG"],
        rechtsfolge="Genehmigung nach § 4 BImSchG ist erforderlich.",
    )


class TestVerweisImplizitAgentWorkflow:
    async def test_calls_llm_once(self, workflow_input: VerweisAgentInputImplizit) -> None:
        """Tests if the LLM is called exactly once during implizit verweis extraction."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputImplizit(verweise=[])
            await VerweisImplizitAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_assigns_verweis_to_matching_tbm(self) -> None:
        """Tests if a Verweis is assigned to the TBM that best matches it."""
        tbm_text = "Betreiben einer Anlage gemäß Vorschrift § 4 BImSchG"
        verweis_text = "Vorschrift § 4 BImSchG"
        workflow_input = VerweisAgentInputImplizit(
            satz_text="Betreiben einer Anlage gemäß Vorschrift § 4 BImSchG erfordert eine Genehmigung.",
            atomare_tatbestandsmerkmale=[tbm_text],
            rechtsfolge="Genehmigung ist erforderlich.",
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputImplizit(verweise=[verweis_text])
            a_tbms_out, _ = await VerweisImplizitAgentWorkflow().run(workflow_input)

        assert len(a_tbms_out) == 1
        assert a_tbms_out[0] == [verweis_text]

    async def test_no_verweise_returns_empty_lists(self, workflow_input: VerweisAgentInputImplizit) -> None:
        """Tests if empty LLM output results in empty lists for both TBMs and rechtsfolge."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputImplizit(verweise=[])
            a_tbms_out, rf_out = await VerweisImplizitAgentWorkflow().run(workflow_input)

        assert all(v == [] for v in a_tbms_out)
        assert rf_out == []


class TestAssignVerweiseToTbmsAndRf:
    @pytest.mark.parametrize(
        "tbm,rf,verweise,expected_tbm_match,expected_rf_match",
        [
            (
                "Betreiben ohne Genehmigung",
                "Verbot gilt.",
                ["Betreiben ohne Genehmigung"],
                True,
                False,
            ),
            (
                "Betreiben ohne Genehmigung",
                "Das Verbot gilt für alle.",
                ["Das Verbot gilt"],
                False,
                True,
            ),
        ],
    )
    def test_assign_verweis_to_correct_target(
        self,
        tbm: str,
        rf: str,
        verweise: list[str],
        expected_tbm_match: bool,
        expected_rf_match: bool,
    ) -> None:
        """Tests if a Verweis is assigned to the correct target (TBM or rechtsfolge) based on fuzzy matching."""
        tbm_lists, rf_list = VerweisImplizitAgentWorkflow._assign_verweise_to_tbms_and_rf(
            a_tbms=[tbm], rf=rf, verweise=verweise, threshold=85.0
        )
        assert bool(tbm_lists[0]) == expected_tbm_match
        assert bool(rf_list) == expected_rf_match

    def test_below_threshold_not_assigned(self) -> None:
        """Verweis with low similarity to both TBM and RF is not assigned anywhere."""
        tbm_lists, rf_list = VerweisImplizitAgentWorkflow._assign_verweise_to_tbms_and_rf(
            a_tbms=["Betreiben einer Anlage"],
            rf="Genehmigung ist erforderlich.",
            verweise=["Völlig unverwandter Textinhalt über Katzen"],
            threshold=85.0,
        )
        assert tbm_lists[0] == []
        assert rf_list == []

    def test_assigns_to_correct_tbm_among_multiple(self) -> None:
        """Verweis is assigned only to the TBM it matches, not others."""
        tbm_lists, _ = VerweisImplizitAgentWorkflow._assign_verweise_to_tbms_and_rf(
            a_tbms=["Betreiben einer Anlage", "Errichtung eines Gebäudes"],
            rf="Genehmigung erforderlich.",
            verweise=["Errichtung eines Gebäudes"],
            threshold=85.0,
        )
        assert tbm_lists[0] == []
        assert tbm_lists[1] == ["Errichtung eines Gebäudes"]

    def test_verweis_can_match_both_tbm_and_rf(self) -> None:
        """A verweis matching both TBM and RF is assigned to both."""
        tbm_lists, rf_list = VerweisImplizitAgentWorkflow._assign_verweise_to_tbms_and_rf(
            a_tbms=["Genehmigung erforderlich"],
            rf="Genehmigung erforderlich.",
            verweise=["Genehmigung erforderlich"],
            threshold=85.0,
        )
        assert tbm_lists[0] == ["Genehmigung erforderlich"]
        assert rf_list == ["Genehmigung erforderlich"]

    def test_threshold_boundary_exact(self) -> None:
        """Score exactly at threshold should be included (>= not >)."""
        # partial_ratio("abc", "abc") == 100, always passes.
        # Use threshold=100 to test exact boundary.
        tbm_lists, _ = VerweisImplizitAgentWorkflow._assign_verweise_to_tbms_and_rf(
            a_tbms=["exact match text"],
            rf="something else entirely different",
            verweise=["exact match text"],
            threshold=100.0,
        )
        assert tbm_lists[0] == ["exact match text"]
