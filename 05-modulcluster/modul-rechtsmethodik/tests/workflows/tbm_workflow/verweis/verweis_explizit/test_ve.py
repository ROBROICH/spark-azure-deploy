# ruff: noqa: PLR2004
"""Tests for VerweisExplizitAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.verweis.verweis_explizit.ve import VerweisExplizitAgentWorkflow
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve_data_format import (
    Verweis,
    VerweisAgentOutputExplizit,
    VerweisBlockExplizit,
)
from src.workflows.tbm_workflow.verweis.verweis_types import VerweisAgentInputExplizit

_PATCH = "src.workflows.tbm_workflow.verweis.verweis_explizit.ve.llm_invoke"


@pytest.fixture
def workflow_input() -> VerweisAgentInputExplizit:
    return VerweisAgentInputExplizit(
        gesetz="BImSchG",
        paragraph_nr="4",
        atomare_tatbestandsmerkmale=["Betreiben einer Anlage"],
        rechtsfolge="Genehmigung ist erforderlich.",
    )


def _make_verweis_block(id: str) -> VerweisBlockExplizit:
    return VerweisBlockExplizit(
        id=id,
        explizit=Verweis(gesetz="BNatSchG", paragraph_nr="44"),
    )


class TestVerweisExplizitAgentWorkflow:
    async def test_calls_llm_once_for_small_input(self, workflow_input: VerweisAgentInputExplizit) -> None:
        """Tests if the LLM is called exactly once for a small input fitting in a single batch."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputExplizit(verweise=[])
            await VerweisExplizitAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_returns_all_verweis_blocks(self, workflow_input: VerweisAgentInputExplizit) -> None:
        """Tests if all Verweis blocks returned by the LLM are included in the result."""
        blocks = [_make_verweis_block("tbm_0"), _make_verweis_block("rf_0")]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputExplizit(verweise=blocks)
            result = await VerweisExplizitAgentWorkflow().run(workflow_input)

        assert len(result) == 2

    async def test_empty_input_still_calls_llm(self) -> None:
        """Tests if the LLM is called even when the atomare_tatbestandsmerkmale list is empty."""
        workflow_input = VerweisAgentInputExplizit(
            gesetz="BImSchG",
            paragraph_nr="4",
            atomare_tatbestandsmerkmale=[],
            rechtsfolge="Genehmigung.",
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputExplizit(verweise=[])
            result = await VerweisExplizitAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()
        assert result == []

    async def test_rf_block_included_from_first_batch_only(self) -> None:
        """Tests if the rf_ Verweis block is deduplicated so it only appears once across batches."""
        tbms = [f"TBM {i}" for i in range(55)]
        workflow_input = VerweisAgentInputExplizit(
            gesetz="BImSchG",
            paragraph_nr="4",
            atomare_tatbestandsmerkmale=tbms,
            rechtsfolge="Genehmigung.",
        )
        rf_block = _make_verweis_block("rf_0")
        tbm_block = _make_verweis_block("tbm_0")

        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            # Both batches return an rf_ block, but second should be deduplicated
            mock_llm.side_effect = [
                VerweisAgentOutputExplizit(verweise=[tbm_block, rf_block]),
                VerweisAgentOutputExplizit(verweise=[_make_verweis_block("tbm_1"), rf_block]),
            ]
            result = await VerweisExplizitAgentWorkflow().run(workflow_input)

        rf_count = sum(1 for v in result if v.id.startswith("rf_"))
        assert rf_count == 1

    async def test_exactly_batch_size_is_single_batch(self) -> None:
        """Tests if exactly BATCH_SIZE (50) TBMs results in a single LLM call."""
        tbms = [f"TBM {i}" for i in range(50)]
        workflow_input = VerweisAgentInputExplizit(
            gesetz="BImSchG",
            paragraph_nr="4",
            atomare_tatbestandsmerkmale=tbms,
            rechtsfolge="Genehmigung.",
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = VerweisAgentOutputExplizit(verweise=[])
            await VerweisExplizitAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()
