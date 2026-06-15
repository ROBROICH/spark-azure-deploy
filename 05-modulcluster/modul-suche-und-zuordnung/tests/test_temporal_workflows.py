"""
Tests for Temporal workflow input/output models.
"""

from temporal.workflows.modul_suche_und_zuordnung.types import NormData

from src.workflows.match_single_tbm_workflow import (
    MatchSingleTBMWorkflowInput,
)

MINIMAL_NORM_DATA = NormData(
    gesetz="TestGesetz",
    jurabk="TG",
    paragraph=None,
    paragraph_nr="1",
    paragraph_titel="Test",
    absaetze=[],
)


class TestMatchSingleTBMWorkflowInput:
    """Tests for MatchSingleTBMWorkflowInput model."""

    def test_valid_input(self) -> None:
        input_data = MatchSingleTBMWorkflowInput(
            data=MINIMAL_NORM_DATA,
            project_id="project-123",
            satz_id="satz-123",
            normdetail_id="normdetail-456",
            research_report=None,
        )
        assert input_data.project_id == "project-123"
        assert input_data.satz_id == "satz-123"
