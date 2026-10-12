"""
Tests for Pydantic input/output models defined in workflow files.

Covers models not already tested in test_temporal_workflows.py:
  - PageIndexSVMWorkflowInput       (pageindex_svm_workflow.py)
  - TBMDBResearchWorkflowInput      (tbm_db_research_workflow.py)
  - TBMDBResearchWorkflowOutput     (tbm_db_research_workflow.py)
  - SatzOrchestratorWorkflowInput   (satz_orchestrator_workflow.py)
  - SatzOrchestratorWorkflowOutput  (satz_orchestrator_workflow.py)

Already covered elsewhere:
  MatchSingleTBMWorkflowInput                           → test_temporal_workflows.py
  MatchedDocument / MatchSingleTBMWorkflowOutput        → test_match_single_tbm_workflow.py
"""

import pytest
from pydantic import ValidationError
from temporal.contracts import (
    SucheZuordnungNormData as NormData,
)
from temporal.contracts import (
    SucheZuordnungPageIndexSVMEntry as PageIndexSVMEntry,
)

from src.tbm_db_research.models import RechtsbegriffEintrag
from src.workflows.pageindex_svm_workflow import PageIndexSVMWorkflowInput
from src.workflows.satz_orchestrator_workflow import (
    SatzOrchestratorWorkflowInput,
    SatzOrchestratorWorkflowOutput,
)
from src.workflows.tbm_db_research_workflow import (
    TBMDBResearchWorkflowInput,
    TBMDBResearchWorkflowOutput,
)

EXPECTED_TATBESTANDSMERKMALE_COUNT = 2
EXPECTED_PRUEFFRAGEN_COUNT = 1
EXPECTED_MAX_CONCURRENT_PAGEINDEX_SVM = 3
EXPECTED_ORIGINALTEXTE_COUNT = 1
EXPECTED_CONSENSUS_RATIO = 1.0
EXPECTED_RELEVANCE = 0.4
EXPECTED_CONFIDENCE = 0.7

MINIMAL_NORM_DATA = NormData(
    gesetz="TestGesetz",
    jurabk="TG",
    paragraph=None,
    paragraph_nr="1",
    paragraph_titel="Test",
    absaetze=[],
)


# ---------------------------------------------------------------------------
# PageIndexSVMWorkflowInput
# ---------------------------------------------------------------------------


class TestPageIndexSVMWorkflowInput:
    """Tests for the PageIndexSVMWorkflowInput Pydantic model."""

    def test_construction(self) -> None:
        """Verify that PageIndexSVMWorkflowInput is constructed correctly with all fields."""
        model = PageIndexSVMWorkflowInput(
            project_id="proj-1",
            file_id="file-1",
            norm="§ 34 BauGB",
            tbm="Erschließung",
            research_report="Some report",
            document=None,
        )
        assert model.project_id == "proj-1"
        assert model.file_id == "file-1"
        assert model.norm == "§ 34 BauGB"
        assert model.tbm == "Erschließung"
        assert model.research_report == "Some report"

    def test_research_report_optional(self) -> None:
        """Verify that research_report can be set to None."""
        model = PageIndexSVMWorkflowInput(
            project_id="p",
            file_id="f",
            norm="norm",
            tbm="tbm",
            research_report=None,
            document=None,
        )
        assert model.research_report is None


# ---------------------------------------------------------------------------
# TBMDBResearchWorkflowInput
# ---------------------------------------------------------------------------


class TestTBMDBResearchWorkflowInput:
    """Tests for the TBMDBResearchWorkflowInput Pydantic model."""

    def test_full_construction(self) -> None:
        """Verify that TBMDBResearchWorkflowInput is constructed correctly with all fields."""
        model = TBMDBResearchWorkflowInput(
            jurabk="BauGB",
            paragraph_nr="34",
            absatz_nr="1",
            satz_nr="2",
            satz_text="Das Vorhaben ist zulässig.",
            tatbestandsmerkmale=["Erschließung", "Zulässigkeit"],
            prueffragen=["Ist die Erschließung gesichert?"],
            rechtsbegriffe=[],
        )
        assert model.jurabk == "BauGB"
        assert model.paragraph_nr == "34"
        assert model.absatz_nr == "1"
        assert model.satz_nr == "2"
        assert len(model.tatbestandsmerkmale) == EXPECTED_TATBESTANDSMERKMALE_COUNT
        assert len(model.prueffragen) == EXPECTED_PRUEFFRAGEN_COUNT

    def test_empty_lists_allowed(self) -> None:
        """Verify that empty lists are accepted for tatbestandsmerkmale, prueffragen, and rechtsbegriffe."""
        model = TBMDBResearchWorkflowInput(
            jurabk="BauGB",
            paragraph_nr="1",
            absatz_nr="1",
            satz_nr="1",
            satz_text="Text.",
            tatbestandsmerkmale=[],
            prueffragen=[],
            rechtsbegriffe=[],
        )
        assert model.tatbestandsmerkmale == []
        assert model.prueffragen == []
        assert model.rechtsbegriffe == []

    def test_rechtsbegriffe_with_entries(self) -> None:
        """Verify that rechtsbegriffe accepts a list of RechtsbegriffEintrag instances."""
        rb = RechtsbegriffEintrag(
            begriff="Erschließung",
            typ="bestimmt",
            definitionen=[],
            auslegungsvorschlaege=[],
        )
        model = TBMDBResearchWorkflowInput(
            jurabk="BauGB",
            paragraph_nr="34",
            absatz_nr="1",
            satz_nr="1",
            satz_text="Text.",
            tatbestandsmerkmale=[],
            prueffragen=[],
            rechtsbegriffe=[rb],
        )
        assert len(model.rechtsbegriffe) == 1
        assert model.rechtsbegriffe[0].begriff == "Erschließung"


# ---------------------------------------------------------------------------
# TBMDBResearchWorkflowOutput
# ---------------------------------------------------------------------------


class TestTBMDBResearchWorkflowOutput:
    """Tests for the TBMDBResearchWorkflowOutput Pydantic model."""

    def test_construction(self) -> None:
        """Verify that TBMDBResearchWorkflowOutput stores the research_report correctly."""
        model = TBMDBResearchWorkflowOutput(research_report="# Pruefungsleitfaden\n\nContent here.")
        assert model.research_report.startswith("# Pruefungsleitfaden")

    def test_empty_report_allowed(self) -> None:
        """Verify that an empty string is accepted for research_report."""
        model = TBMDBResearchWorkflowOutput(research_report="")
        assert model.research_report == ""


# ---------------------------------------------------------------------------
# SatzOrchestratorWorkflowInput
# ---------------------------------------------------------------------------


class TestSatzOrchestratorWorkflowInput:
    """Tests for the SatzOrchestratorWorkflowInput Pydantic model."""

    def test_full_construction(self) -> None:
        """Verify that SatzOrchestratorWorkflowInput is constructed correctly with all fields."""
        model = SatzOrchestratorWorkflowInput(
            norm="§ 34 BauGB",
            tbm="Erschließung",
            satz_id="satz-uuid-1",
            gesetz_id="gesetz-uuid-1",
            norm_id="norm-uuid-1",
            data=MINIMAL_NORM_DATA,
            project_id="proj-1",
            normdetail_id="nd-1",
            max_concurrent_pageindex_svm=3,
            document_nodes=[],
        )
        assert model.norm == "§ 34 BauGB"
        assert model.satz_id == "satz-uuid-1"
        assert model.gesetz_id == "gesetz-uuid-1"
        assert model.norm_id == "norm-uuid-1"
        assert model.max_concurrent_pageindex_svm == EXPECTED_MAX_CONCURRENT_PAGEINDEX_SVM

    def test_max_concurrent_defaults_to_none(self) -> None:
        """Verify that max_concurrent_pageindex_svm defaults to None when not provided."""
        model = SatzOrchestratorWorkflowInput(
            norm="norm",
            tbm="tbm",
            satz_id="s",
            gesetz_id="g",
            norm_id="n",
            data=MINIMAL_NORM_DATA,
            project_id="p",
            normdetail_id="n",
            document_nodes=[],
        )
        assert model.max_concurrent_pageindex_svm is None


# ---------------------------------------------------------------------------
# SatzOrchestratorWorkflowOutput
# ---------------------------------------------------------------------------


class TestSatzOrchestratorWorkflowOutput:
    """Tests for the SatzOrchestratorWorkflowOutput Pydantic model."""

    def test_construction_with_entries(self) -> None:
        """Verify that SatzOrchestratorWorkflowOutput holds a flat list of originaltexte."""
        entry = PageIndexSVMEntry(node_id="n1", title="Title", text="Content", chunk_ids=["c1"], document_id="abc")
        model = SatzOrchestratorWorkflowOutput(
            satz_id="satz-uuid-1",
            gesetz_id="gesetz-uuid-1",
            norm_id="norm-uuid-1",
            originaltexte=[entry],
        )
        assert model.satz_id == "satz-uuid-1"
        assert model.gesetz_id == "gesetz-uuid-1"
        assert model.norm_id == "norm-uuid-1"
        assert len(model.originaltexte) == EXPECTED_ORIGINALTEXTE_COUNT
        assert model.originaltexte[0].node_id == "n1"

    def test_entry_reliability_values_default_to_absent(self) -> None:
        """Verify that an entry built without reliability signals carries none of the three values."""
        entry = PageIndexSVMEntry(node_id="n1", title="Title", text="Content", chunk_ids=["c1"], document_id="abc")
        assert entry.consensus_ratio is None
        assert entry.relevance is None
        assert entry.confidence is None

    def test_entry_carries_reliability_values(self) -> None:
        """Verify that an entry stores the confidence next to both raw signals."""
        entry = PageIndexSVMEntry(
            node_id="n1",
            title="Title",
            text="Content",
            chunk_ids=["c1"],
            document_id="abc",
            consensus_ratio=1.0,
            relevance=0.4,
            confidence=0.7,
        )
        assert entry.consensus_ratio == EXPECTED_CONSENSUS_RATIO
        assert entry.relevance == EXPECTED_RELEVANCE
        assert entry.confidence == EXPECTED_CONFIDENCE

    def test_entry_rejects_a_value_outside_the_range(self) -> None:
        """Verify that a confidence outside 0.0 to 1.0 is rejected."""
        with pytest.raises(ValidationError):
            PageIndexSVMEntry(
                node_id="n1",
                title="Title",
                text="Content",
                chunk_ids=["c1"],
                document_id="abc",
                confidence=1.5,
            )

    def test_empty_originaltexte(self) -> None:
        """Verify that an empty originaltexte list is accepted."""
        model = SatzOrchestratorWorkflowOutput(
            satz_id="s",
            gesetz_id="g",
            norm_id="n",
            originaltexte=[],
        )
        assert model.originaltexte == []
