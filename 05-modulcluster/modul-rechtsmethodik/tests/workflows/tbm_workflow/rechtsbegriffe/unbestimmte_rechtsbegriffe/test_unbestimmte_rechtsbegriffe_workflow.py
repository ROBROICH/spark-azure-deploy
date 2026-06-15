# ruff: noqa: PLR2004
"""Tests for UnbestimmteRechtsbegriffeWorkflow branching logic."""

from unittest.mock import AsyncMock, patch

from fixtures.bnatschg_44 import SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE, SATZ_1_NR_1_TEXT

from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_types import UnbestimmteRechtsbegriffeWorkflowInput
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_workflow import (
    UnbestimmteRechtsbegriffeWorkflow,
)

_PATCH_CHILD = "temporalio.workflow.execute_child_workflow"


def _make_input(atomare: list[str] | None = None) -> UnbestimmteRechtsbegriffeWorkflowInput:
    return UnbestimmteRechtsbegriffeWorkflowInput(
        jurabk="BNatSchG",
        paragraph_nr="44",
        paragraph_text="Die Behörde entscheidet im öffentlichen Interesse.",
        absatz_nr="1",
        satz_nr="1",
        markers=["§ 44 Abs. 1 S. 1"],
        satz_text="Die Behörde entscheidet im öffentlichen Interesse.",
        atomare_tatbestandsmerkmale=atomare or ["Behörde entscheidet"],
    )


class TestUnbestimmteRechtsbegriffeWorkflow:
    async def test_empty_urp_returns_empty_lists_per_a_tbm(self) -> None:
        """Tests if an empty urp output results in empty lists for each atomare TBM."""
        input_data = _make_input(atomare=["TBM A", "TBM B"])
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_ure: list[object] = []
            empty_urp: list[object] = []
            mock_child.side_effect = [
                empty_ure,  # ure_output: no terms recognized
                empty_urp,  # urp_output: empty after prüfung
            ]
            result = await UnbestimmteRechtsbegriffeWorkflow().run(input_data)

        assert result == [[], []]

    async def test_empty_urp_output_count_matches_a_tbm_count(self) -> None:
        """Tests if the output list count matches the number of atomare TBMs even when urp output is empty."""
        input_data = _make_input(atomare=["TBM A", "TBM B", "TBM C"])
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_ure: list[object] = []
            empty_urp: list[object] = []
            mock_child.side_effect = [empty_ure, empty_urp]
            result = await UnbestimmteRechtsbegriffeWorkflow().run(input_data)

        assert len(result) == 3
        assert all(inner == [] for inner in result)

    async def test_no_auslegung_called_when_urp_empty(self) -> None:
        """Tests if the auslegung workflow is not called when urp output is empty."""
        input_data = _make_input(atomare=["TBM A"])
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_ure: list[object] = []
            empty_urp: list[object] = []
            mock_child.side_effect = [empty_ure, empty_urp]
            await UnbestimmteRechtsbegriffeWorkflow().run(input_data)

        assert mock_child.call_count == 2


class TestUnbestimmteRechtsbegriffeWithRealData:
    """Tests using real BNatSchG § 44 atomare TBMs."""

    async def test_output_length_matches_real_atomare_count(self) -> None:
        """Tests if the output length matches the real BNatSchG § 44 atomare TBM count."""
        input_data = UnbestimmteRechtsbegriffeWorkflowInput(
            jurabk="BNatSchG",
            paragraph_nr="44",
            paragraph_text=SATZ_1_NR_1_TEXT,
            absatz_nr="1",
            satz_nr="1",
            markers=["§ 44 Abs. 1 S. 1"],
            satz_text=SATZ_1_NR_1_TEXT,
            atomare_tatbestandsmerkmale=SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE,
        )
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            empty_ure: list[object] = []
            empty_urp: list[object] = []
            mock_child.side_effect = [empty_ure, empty_urp]
            result = await UnbestimmteRechtsbegriffeWorkflow().run(input_data)

        assert len(result) == len(SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE)
