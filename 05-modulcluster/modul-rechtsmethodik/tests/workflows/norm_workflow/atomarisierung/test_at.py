# ruff: noqa: PLR2004
"""Tests for AtomarisierungsAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from fixtures.bnatschg_44 import (
    SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE,
    SATZ_1_NR_1_TATBESTANDSMERKMALE,
    SATZ_1_NR_1_TEXT,
)

from src.workflows.norm_workflow.atomarisierung.at import AtomarisierungsAgentWorkflow
from src.workflows.norm_workflow.atomarisierung.at_data_format import AtomarisierungsAgentOutput
from src.workflows.norm_workflow.norm_types import AtomarisierungsAgentInput

_PATCH = "src.workflows.norm_workflow.atomarisierung.at.llm_invoke"


@pytest.fixture
def workflow_input() -> AtomarisierungsAgentInput:
    return AtomarisierungsAgentInput(
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        tatbestandsmerkmale=["Betreiben einer Anlage"],
    )


class TestAtomarisierungsAgentWorkflow:
    async def test_calls_llm_once(self, workflow_input: AtomarisierungsAgentInput) -> None:
        """Tests if the LLM is called exactly once during atomarisierung."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = AtomarisierungsAgentOutput(tatbestandsmerkmale=["Betreiben einer Anlage"])
            await AtomarisierungsAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_returns_tatbestandsmerkmale_list(self, workflow_input: AtomarisierungsAgentInput) -> None:
        """Tests if the workflow returns the list of atomare Tatbestandsmerkmale from the LLM output."""
        expected = ["Betreiben einer Anlage", "Anlage ist genehmigungspflichtig"]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = AtomarisierungsAgentOutput(tatbestandsmerkmale=expected)
            result = await AtomarisierungsAgentWorkflow().run(workflow_input)

        assert result == expected

    @pytest.mark.parametrize(
        "tbms",
        [
            ["Einzelnes Merkmal"],
            ["Merkmal A", "Merkmal B"],
            ["Merkmal A", "Merkmal B", "Merkmal C"],
        ],
    )
    async def test_returns_all_tbms_from_llm(self, workflow_input: AtomarisierungsAgentInput, tbms: list[str]) -> None:
        """Tests if all Tatbestandsmerkmale returned by the LLM are passed through unchanged."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = AtomarisierungsAgentOutput(tatbestandsmerkmale=tbms)
            result = await AtomarisierungsAgentWorkflow().run(workflow_input)

        assert result == tbms


class TestAtomarisierungsWithRealData:
    """Tests using real BNatSchG § 44 production data as mock values."""

    async def test_real_bnatschg_atomare_tbms_count(self) -> None:
        """Tests if the atomarisierung of BNatSchG § 44 Satz 1 returns exactly 7 atomare TBMs."""
        inp = AtomarisierungsAgentInput(
            satz_text=SATZ_1_NR_1_TEXT,
            tatbestandsmerkmale=SATZ_1_NR_1_TATBESTANDSMERKMALE,
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = AtomarisierungsAgentOutput(
                tatbestandsmerkmale=SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE
            )
            result = await AtomarisierungsAgentWorkflow().run(inp)

        assert len(result) == 7

    async def test_real_bnatschg_atomare_tbms_content(self) -> None:
        """Tests if the atomarisierung of BNatSchG § 44 Satz 1 returns the expected atomare TBMs."""
        inp = AtomarisierungsAgentInput(
            satz_text=SATZ_1_NR_1_TEXT,
            tatbestandsmerkmale=SATZ_1_NR_1_TATBESTANDSMERKMALE,
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = AtomarisierungsAgentOutput(
                tatbestandsmerkmale=SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE
            )
            result = await AtomarisierungsAgentWorkflow().run(inp)

        assert result == SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE
