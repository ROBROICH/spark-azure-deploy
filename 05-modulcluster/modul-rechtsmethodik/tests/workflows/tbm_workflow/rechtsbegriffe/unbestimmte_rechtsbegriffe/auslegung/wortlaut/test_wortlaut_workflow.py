# ruff: noqa: PLR2004
"""Tests for WortlautAuslegungWorkflow static method and empty guard."""

from unittest.mock import AsyncMock, patch

from temporal.contracts import UnbestimmterRechtsbegriff

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UnbestimmterRechtsbegriffWithContext,
    WortlautAuslegungWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa_data_format import (
    WortlautAuslegerUnbestimmterRechtsbegriff,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow import (
    WortlautAuslegungWorkflow,
)

_PATCH_CHILD = "temporalio.workflow.execute_child_workflow"


def _make_ur(begriff: str = "öffentliches Interesse") -> UnbestimmterRechtsbegriff:
    return UnbestimmterRechtsbegriff(
        begriff=begriff,
        auslegungsvorschläge=[],
    )


def _make_enriched(begriff: str = "öffentliches Interesse") -> UnbestimmterRechtsbegriffWithContext:
    return UnbestimmterRechtsbegriffWithContext(
        begriff=begriff,
        auslegungsvorschläge=[],
        u_context=[],  # type: ignore[arg-type]
        d_context=[],  # type: ignore[arg-type]
    )


def _make_ausleger_output(id: str, begriff: str, auslegung: str) -> WortlautAuslegerUnbestimmterRechtsbegriff:
    return WortlautAuslegerUnbestimmterRechtsbegriff(id=id, u_begriff=begriff, auslegung=auslegung)


class TestApplyAuslegungen:
    def test_sets_auslegung_methode_to_wortlaut(self) -> None:
        """Tests if the auslegung_methode is set to 'wortlaut' when applying auslegungen."""
        wa_output = [_make_ur("Ermessen")]
        ausleger = [_make_ausleger_output("0", "Ermessen", "Spielraum der Behörde.")]
        result = WortlautAuslegungWorkflow._apply_auslegungen(wa_output, ausleger)
        assert result[0].auslegungsvorschläge[0].auslegung_methode == "wortlaut"

    def test_sets_auslegungsvorschlag_text(self) -> None:
        """Tests if the auslegungsvorschlag text from the ausleger output is set correctly."""
        wa_output = [_make_ur()]
        ausleger = [_make_ausleger_output("0", "öffentliches Interesse", "Wohl der Allgemeinheit.")]
        result = WortlautAuslegungWorkflow._apply_auslegungen(wa_output, ausleger)
        assert result[0].auslegungsvorschläge[0].auslegungsvorschlag == "Wohl der Allgemeinheit."

    def test_preserves_length(self) -> None:
        """Tests if the output list length matches the number of input Rechtsbegriffe."""
        wa_output = [_make_ur("Begriff A"), _make_ur("Begriff B")]
        ausleger = [
            _make_ausleger_output("0", "Begriff A", "Auslegung A."),
            _make_ausleger_output("1", "Begriff B", "Auslegung B."),
        ]
        result = WortlautAuslegungWorkflow._apply_auslegungen(wa_output, ausleger)
        assert len(result) == 2

    def test_assigns_correct_begriff_per_index(self) -> None:
        """Tests if each Begriff is correctly assigned to its corresponding index in the output."""
        wa_output = [_make_ur("Begriff A"), _make_ur("Begriff B")]
        ausleger = [
            _make_ausleger_output("0", "Begriff A Neu", "Auslegung A."),
            _make_ausleger_output("1", "Begriff B Neu", "Auslegung B."),
        ]
        result = WortlautAuslegungWorkflow._apply_auslegungen(wa_output, ausleger)
        assert result[0].begriff == "Begriff A Neu"
        assert result[1].begriff == "Begriff B Neu"


class TestWortlautWorkflowRun:
    async def test_empty_enriched_urp_returns_empty_list(self) -> None:
        """Tests if an empty enriched_urp list returns an empty result without calling any child workflow."""
        input_data = WortlautAuslegungWorkflowInput(
            satz_text="Ein Satz.",
            paragraph_text="Ein Paragraph.",
            enriched_urp=[],
        )
        with patch(_PATCH_CHILD, new_callable=AsyncMock) as mock_child:
            result = await WortlautAuslegungWorkflow().run(input_data)
        mock_child.assert_not_called()
        assert result == []
