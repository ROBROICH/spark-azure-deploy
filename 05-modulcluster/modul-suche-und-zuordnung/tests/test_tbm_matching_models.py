"""
Tests for Pydantic response models used by the TBM matching pipeline.

Covers:
  - Stage1Response, ChunkSentenceResult, Stage2SentenceResponse  (prompts.py)
  - HyDEResponse                                                  (hyde_output_format.py)
  - QueryReformulationOutput                                      (qr_output_format.py)
  - MatchingRule                                                  (lookup_data.py)
  - RechtsbegriffDefinition, RechtsbegriffEintrag                 (tbm_db_research/models.py)
"""

import dataclasses

import pytest
from pydantic import ValidationError

from src.pageindex_svm.prompts import (
    ChunkSentenceResult,
    Stage1Response,
    Stage2SentenceResponse,
)
from src.tbm_db_research.models import (
    RechtsbegriffDefinition,
    RechtsbegriffEintrag,
)
from src.tbm_matching.rule_based_matching.lookup_data import MatchingRule

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPECTED_STAGE2_RESULT_COUNT = 2
RELEVANCE_VALUE = 0.7

# ---------------------------------------------------------------------------
# Stage1Response
# ---------------------------------------------------------------------------


class TestStage1Response:
    """Tests for the Stage1Response Pydantic model."""

    def test_construction(self) -> None:
        """Verify that Stage1Response stores node_list correctly."""
        model = Stage1Response(node_list=[1, 2])
        assert model.node_list == [1, 2]

    def test_empty_node_list(self) -> None:
        """Verify that an empty node_list is accepted."""
        model = Stage1Response(node_list=[])
        assert model.node_list == []


# ---------------------------------------------------------------------------
# ChunkSentenceResult
# ---------------------------------------------------------------------------


class TestChunkSentenceResult:
    """Tests for the ChunkSentenceResult Pydantic model."""

    def test_construction(self) -> None:
        """Verify that ChunkSentenceResult stores node_id, relevant_indices, and begruendung."""
        model = ChunkSentenceResult(
            node_id="n1",
            relevant_indices=[0, 2, 4],
            begruendung="Sentences 0, 2, 4 are relevant.",
            relevance=0.7,
        )
        assert model.node_id == "n1"
        assert model.relevant_indices == [0, 2, 4]
        assert "0, 2, 4" in model.begruendung
        assert model.relevance == RELEVANCE_VALUE

    def test_empty_indices(self) -> None:
        """Verify that an empty relevant_indices list is accepted."""
        model = ChunkSentenceResult(node_id="n1", relevant_indices=[], begruendung="None", relevance=0.0)
        assert model.relevant_indices == []

    def test_relevance_outside_range_rejected(self) -> None:
        """Verify that a relevance value outside 0.0 to 1.0 is rejected."""
        with pytest.raises(ValidationError):
            ChunkSentenceResult(node_id="n1", relevant_indices=[0], begruendung="B", relevance=1.5)

    def test_relevance_defaults_to_absent(self) -> None:
        """Verify that an omitted relevance value stays absent instead of defaulting to a number."""
        model = ChunkSentenceResult(node_id="n1", relevant_indices=[0], begruendung="B")
        assert model.relevance is None


# ---------------------------------------------------------------------------
# Stage2SentenceResponse
# ---------------------------------------------------------------------------


class TestStage2SentenceResponse:
    """Tests for the Stage2SentenceResponse Pydantic model."""

    def test_construction_with_results(self) -> None:
        """Verify that Stage2SentenceResponse stores a list of ChunkSentenceResult entries."""
        results = [
            ChunkSentenceResult(node_id="n1", relevant_indices=[0], begruendung="B", relevance=0.5),
            ChunkSentenceResult(node_id="n2", relevant_indices=[1, 2], begruendung="C", relevance=0.5),
        ]
        model = Stage2SentenceResponse(results=results)
        assert len(model.results) == EXPECTED_STAGE2_RESULT_COUNT

    def test_empty_results(self) -> None:
        """Verify that an empty results list is accepted."""
        model = Stage2SentenceResponse(results=[])
        assert model.results == []


# ---------------------------------------------------------------------------
# MatchingRule
# ---------------------------------------------------------------------------


class TestMatchingRule:
    """Tests for the MatchingRule dataclass."""

    def test_construction_single_number(self) -> None:
        """Verify that MatchingRule is constructed correctly with a single paragraph number."""
        rule = MatchingRule(
            number="34",
            law="BauGB",
            absatz="1",
            satz="1",
            documents=("Erläuterungsbericht",),
        )
        assert rule.number == "34"
        assert rule.law == "BauGB"
        assert "Erläuterungsbericht" in rule.documents

    def test_construction_range_number(self) -> None:
        """Verify that MatchingRule accepts a tuple range as the number field."""
        rule = MatchingRule(
            number=("15", "28"),
            law="UVPG",
            absatz=None,
            satz=None,
            documents=("UVP-Bericht",),
        )
        assert rule.number == ("15", "28")

    def test_wildcard_fields_as_none(self) -> None:
        """Verify that number and law can be set to None to act as wildcards."""
        rule = MatchingRule(number=None, law=None, absatz=None, satz=None, documents=())
        assert rule.number is None
        assert rule.law is None

    def test_is_frozen(self) -> None:
        """Verify that MatchingRule instances are immutable (frozen dataclass)."""
        rule = MatchingRule(number="1", law="X", absatz=None, satz=None, documents=())
        with pytest.raises(dataclasses.FrozenInstanceError):
            rule.law = "Y"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# RechtsbegriffDefinition
# ---------------------------------------------------------------------------


class TestRechtsbegriffDefinition:
    """Tests for the RechtsbegriffDefinition Pydantic model."""

    def test_construction_with_source(self) -> None:
        """Verify that RechtsbegriffDefinition stores text and source dict correctly."""
        model = RechtsbegriffDefinition(
            text="Die Erschließung...",
            source={"jurabk": "BauGB", "paragraph_nr": "34"},
        )
        assert model.text == "Die Erschließung..."
        assert model.source is not None
        assert model.source["jurabk"] == "BauGB"

    def test_source_defaults_to_none(self) -> None:
        """Verify that source defaults to None when not provided."""
        model = RechtsbegriffDefinition(text="Definition without source")
        assert model.source is None


# ---------------------------------------------------------------------------
# RechtsbegriffEintrag
# ---------------------------------------------------------------------------


class TestRechtsbegriffEintrag:
    """Tests for the RechtsbegriffEintrag Pydantic model."""

    def test_bestimmt_construction(self) -> None:
        """Verify that a 'bestimmt' RechtsbegriffEintrag is constructed correctly."""
        model = RechtsbegriffEintrag(
            begriff="Erschließung",
            typ="bestimmt",
            definitionen=[RechtsbegriffDefinition(text="Def.", source=None)],
        )
        assert model.typ == "bestimmt"
        assert len(model.definitionen) == 1

    def test_unbestimmt_construction(self) -> None:
        """Verify that an 'unbestimmt' RechtsbegriffEintrag stores auslegungsvorschlaege."""
        model = RechtsbegriffEintrag(
            begriff="Zumutbarkeit",
            typ="unbestimmt",
            auslegungsvorschlaege=["Interpretation A"],
        )
        assert model.typ == "unbestimmt"
        assert model.auslegungsvorschlaege == ["Interpretation A"]

    def test_defaults_are_empty_lists(self) -> None:
        """Verify that definitionen and auslegungsvorschlaege default to empty lists."""
        model = RechtsbegriffEintrag(begriff="X", typ="bestimmt")
        assert model.definitionen == []
        assert model.auslegungsvorschlaege == []

    def test_invalid_typ_raises(self) -> None:
        """Verify that an unrecognised typ value raises a validation error."""
        with pytest.raises(ValidationError):
            RechtsbegriffEintrag(begriff="X", typ="unknown")  # type: ignore[arg-type]
