# ruff: noqa: PLR2004
"""Tests for AdressatenErmessenWorkflow branching logic."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.rf_workflow.adressaten_ermessen_workflow.adressaten_ermessen_workflow import (
    AdressatenErmessenWorkflow,
)

_PATCH_CHILD = "temporalio.workflow.execute_child_workflow"


class TestAdressatenErmessenWorkflow:
    async def test_keine_handlungsermaechtigung_returns_early(self, rechtsfolge_text: str) -> None:
        """Tests if 'keine handlungsermächtigung' causes the workflow to return after one child call with no Ermessen."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = "keine handlungsermächtigung"
            result = await AdressatenErmessenWorkflow().run(rechtsfolge_text)

        assert result.rechtsfolgen_adressat == "keine handlungsermächtigung"
        assert result.ermessensspielraum is None
        assert result.ermessensart is None
        assert mock_child.call_count == 1

    async def test_handlungsermaechtigung_triggers_ermessen_check(self, rechtsfolge_text: str) -> None:
        """Tests if 'handlungsermächtigung' triggers a second child call to identify Ermessensspielraum."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = ["handlungsermächtigung", "gebundene entscheidung"]
            result = await AdressatenErmessenWorkflow().run(rechtsfolge_text)

        assert result.rechtsfolgen_adressat == "handlungsermächtigung"
        assert result.ermessensspielraum == "gebundene entscheidung"
        assert result.ermessensart is None
        assert mock_child.call_count == 2

    async def test_ermessensentscheidung_triggers_ermessensart_check(self, rechtsfolge_text: str) -> None:
        """Tests if 'ermessensentscheidung' triggers a third child call to determine Ermessensart."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = ["handlungsermächtigung", "ermessensentscheidung", "auswahlermessen"]
            result = await AdressatenErmessenWorkflow().run(rechtsfolge_text)

        assert result.rechtsfolgen_adressat == "handlungsermächtigung"
        assert result.ermessensspielraum == "ermessensentscheidung"
        assert result.ermessensart == "auswahlermessen"
        assert mock_child.call_count == 3

    async def test_result_contains_rechtsfolge_text(self, rechtsfolge_text: str) -> None:
        """Tests if the rechtsfolge text from the input is preserved in the workflow output."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.return_value = "keine handlungsermächtigung"
            result = await AdressatenErmessenWorkflow().run(rechtsfolge_text)

        assert result.text == rechtsfolge_text

    @pytest.mark.parametrize(
        "ermessensart",
        ["entschließungsermessen", "auswahlermessen", "beides"],
    )
    async def test_all_ermessensart_values(self, ermessensart: str, rechtsfolge_text: str) -> None:
        """Tests if all Ermessensart values are correctly stored in the result."""
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            mock_child.side_effect = ["handlungsermächtigung", "ermessensentscheidung", ermessensart]
            result = await AdressatenErmessenWorkflow().run(rechtsfolge_text)

        assert result.ermessensart == ermessensart
