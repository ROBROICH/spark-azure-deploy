# ruff: noqa: PLR2004
"""Tests for PraedikatenlogikModelliererAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from fixtures.bnatschg_44 import SATZ_1_NR_1_TATBESTANDSMERKMALE, SATZ_1_NR_1_TEXT

from src.workflows.norm_workflow.praedikatenlogik.pm import PraedikatenlogikModelliererAgentWorkflow
from src.workflows.norm_workflow.praedikatenlogik.pm_data_format import PraedikatenlogikModelliererAgentOutput

_PATCH = "src.workflows.norm_workflow.praedikatenlogik.pm.llm_invoke"

_SATZ = "Wer eine Anlage ohne Genehmigung betreibt, wird bestraft."


class TestPraedikatenlogikModelliererAgentWorkflow:
    async def test_calls_llm_once(self) -> None:
        """Tests if the LLM is called exactly once during predicate logic modelling."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = PraedikatenlogikModelliererAgentOutput(
                tatbestandsmerkmale=["Betreiben ohne Genehmigung"],
                rechtsfolgen=["Bestrafung"],
            )
            await PraedikatenlogikModelliererAgentWorkflow().run(_SATZ)

        mock_llm.assert_called_once()

    async def test_returns_tbms_and_rechtsfolgen_tuple(self) -> None:
        """Tests if the workflow returns a tuple of Tatbestandsmerkmale and Rechtsfolgen from the LLM output."""
        tbms = ["Betreiben einer Anlage", "keine Genehmigung vorhanden"]
        rechtsfolgen = ["Bestrafung mit Freiheitsstrafe"]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = PraedikatenlogikModelliererAgentOutput(
                tatbestandsmerkmale=tbms, rechtsfolgen=rechtsfolgen
            )
            result_tbms, result_rf = await PraedikatenlogikModelliererAgentWorkflow().run(_SATZ)

        assert result_tbms == tbms
        assert result_rf == rechtsfolgen

    @pytest.mark.parametrize(
        "tbms,rechtsfolgen",
        [
            (["Merkmal A"], ["Rechtsfolge X"]),
            (["Merkmal A", "Merkmal B"], ["Rechtsfolge X", "Rechtsfolge Y"]),
            ([], ["Rechtsfolge X"]),
            (["Merkmal A"], []),
        ],
    )
    async def test_tuple_unpacking_matches_llm_output(self, tbms: list[str], rechtsfolgen: list[str]) -> None:
        """Tests if the tuple result matches the LLM output for various TBM and Rechtsfolgen combinations."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = PraedikatenlogikModelliererAgentOutput(
                tatbestandsmerkmale=tbms, rechtsfolgen=rechtsfolgen
            )
            result = await PraedikatenlogikModelliererAgentWorkflow().run(_SATZ)

        assert result == (tbms, rechtsfolgen)


class TestPraedikatenlogikWithRealData:
    """Tests using real BNatSchG § 44 production data as mock values."""

    async def test_real_bnatschg_tbm_count(self) -> None:
        """Tests if the praedikatenlogik modelling of BNatSchG § 44 Satz 1 returns exactly 7 TBMs."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = PraedikatenlogikModelliererAgentOutput(
                tatbestandsmerkmale=SATZ_1_NR_1_TATBESTANDSMERKMALE,
                rechtsfolgen=["Es ist verboten."],
            )
            tbms, _ = await PraedikatenlogikModelliererAgentWorkflow().run(SATZ_1_NR_1_TEXT)

        assert len(tbms) == 7

    async def test_real_bnatschg_rechtsfolge_verboten(self) -> None:
        """Tests if the praedikatenlogik modelling of BNatSchG § 44 Satz 1 returns the expected Rechtsfolge."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = PraedikatenlogikModelliererAgentOutput(
                tatbestandsmerkmale=SATZ_1_NR_1_TATBESTANDSMERKMALE,
                rechtsfolgen=["Es ist verboten."],
            )
            _, rechtsfolgen = await PraedikatenlogikModelliererAgentWorkflow().run(SATZ_1_NR_1_TEXT)

        assert rechtsfolgen == ["Es ist verboten."]
