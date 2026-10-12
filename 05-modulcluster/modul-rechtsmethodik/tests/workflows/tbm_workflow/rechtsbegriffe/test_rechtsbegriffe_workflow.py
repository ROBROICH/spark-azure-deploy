"""Tests for RechtsbegriffeWorkflow output assembly."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.contracts import BestimmterRechtsbegriff, UnbestimmterRechtsbegriff

from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_workflow import RechtsbegriffeWorkflow
from src.workflows.tbm_workflow.tbm_types import RechtsbegriffeWorkflowInput

_PATCH_CHILD = "temporalio.workflow.execute_child_workflow"
_PATCH_GATHER = "src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_workflow.asyncio.gather"


def _make_input(atomare: list[str]) -> RechtsbegriffeWorkflowInput:
    return RechtsbegriffeWorkflowInput(
        gesetz="BNatSchG",
        jurabk="BNatSchG",
        paragraph_nr="44",
        paragraph_text="Freitext.",
        absatz_nr="1",
        satz_nr="1",
        markers=["§ 44 Abs. 1 S. 1"],
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        atomare_tatbestandsmerkmale=atomare,
    )


def _empty_bre() -> list[BestimmterRechtsbegriff]:
    return []


def _empty_ur() -> list[UnbestimmterRechtsbegriff]:
    return []


class TestRechtsbegriffeWorkflow:
    @pytest.mark.parametrize("count", [1, 2, 4])
    async def test_output_length_matches_atomare_tbm_count(self, count: int) -> None:
        """Tests if the output Rechtsbegriffe count matches the number of atomare TBMs."""
        a_tbms = [f"TBM {i}" for i in range(count)]
        bre_output = [_empty_bre() for _ in a_tbms]
        ur_output = [_empty_ur() for _ in a_tbms]

        with patch(_PATCH_CHILD, new_callable=AsyncMock), patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
            mock_gather.return_value = (bre_output, ur_output)
            result = await RechtsbegriffeWorkflow().run(_make_input(a_tbms))

        assert len(result) == count

    async def test_empty_atomare_tbms_returns_empty(self) -> None:
        """Tests if an empty atomare TBMs list results in an empty Rechtsbegriffe output."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock), patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather:
            empty_bre: list[list[BestimmterRechtsbegriff]] = []
            empty_ur: list[list[UnbestimmterRechtsbegriff]] = []
            mock_gather.return_value = (
                empty_bre,
                empty_ur,
            )
            result = await RechtsbegriffeWorkflow().run(_make_input([]))

        assert result == []
