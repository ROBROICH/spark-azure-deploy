"""
Tests for pure functions in src/tbm_matching/retrieval.py and src/tbm_matching/tbm_enrichment.py.

Only tests functions that require no I/O (no Qdrant, no HTTP):
- extract_tbms_for_satz
- fuse_retrieval_results
- filter_documents
"""

from typing import Any

import pytest
from temporal.workflows.modul_suche_und_zuordnung.types import (
    Absatz,
    AtomaresTBM,
    NormData,
    Satz,
)

from src.tbm_matching.retrieval import filter_documents
from src.tbm_matching.tbm_enrichment import extract_tbms_for_satz, fuse_retrieval_results

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPECTED_TBM_COUNT = 2
EXPECTED_TBM_LIST_COUNT = 2

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _norm_data(
    absaetze: list[Absatz] | None = None,
    jurabk: str = "BauGB",
    paragraph_nr: str = "35",
) -> NormData:
    return NormData(
        gesetz="Baugesetzbuch",
        jurabk=jurabk,
        paragraph=None,
        paragraph_nr=paragraph_nr,
        paragraph_titel="Test",
        absaetze=absaetze or [],
    )


def _absatz(nr: str, saetze: list[Satz] | None = None, text: str = "Absatz text.") -> Absatz:
    return Absatz(absatz_nr=nr, absatz_text=text, saetze=saetze or [])


def _satz(nr: str, tbms: list[AtomaresTBM] | None = None, satz_id: str | None = None) -> Satz:
    return Satz(
        id=satz_id or f"satz-{nr}",
        satz_nr=nr,
        satz_text="Satz text.",
        tatbestandsmerkmale=["tbm1"],
        atomare_tatbestandsmerkmale=tbms or [],
    )


def _tbm(prueffrage: str = "Ist das zulässig?") -> AtomaresTBM:
    return AtomaresTBM(id=None, prueffrage=prueffrage, rechtsbegriffe=None)


# ---------------------------------------------------------------------------
# extract_tbms_for_satz
# ---------------------------------------------------------------------------


class TestExtractTbmsForSatz:
    """Tests for extract_tbms_for_satz extracting TBM dicts for a specific Satz."""

    def test_extracts_matching_satz(self) -> None:
        tbm = _tbm("Q1?")
        norm = _norm_data(absaetze=[_absatz("1", [_satz("1", [tbm], satz_id="satz-1")])])
        result = extract_tbms_for_satz(norm, "satz-1")
        assert len(result) == 1
        assert result[0]["prueffrage"] == "Q1?"
        assert result[0]["_absatz_text"] == "Absatz text."
        assert result[0]["_paragraph_nr"] == "35"
        assert result[0]["_jurabk"] == "BauGB"
        assert result[0]["_absatz_nr"] == "1"
        assert result[0]["_satz_nr"] == "1"

    def test_multiple_tbms_in_satz(self) -> None:
        tbms = [_tbm("Q1?"), _tbm("Q2?")]
        norm = _norm_data(absaetze=[_absatz("1", [_satz("1", tbms, satz_id="satz-1")])])
        result = extract_tbms_for_satz(norm, "satz-1")
        assert len(result) == EXPECTED_TBM_COUNT

    def test_unknown_satz_id_raises(self) -> None:
        norm = _norm_data(absaetze=[_absatz("1", [_satz("1", [_tbm()], satz_id="satz-1")])])
        with pytest.raises(ValueError, match="satz_id=missing"):
            extract_tbms_for_satz(norm, "missing")

    def test_empty_tbms_raises(self) -> None:
        norm = _norm_data(absaetze=[_absatz("1", [_satz("1", [], satz_id="satz-1")])])
        with pytest.raises(ValueError, match="satz_id=satz-1"):
            extract_tbms_for_satz(norm, "satz-1")

    def test_duplicate_satz_numbers_can_be_selected_by_id(self) -> None:
        tbm = _tbm("Q2?")
        norm = _norm_data(
            absaetze=[
                _absatz(
                    "1",
                    [
                        _satz("1", [_tbm("Q1?")], satz_id="satz-1"),
                        _satz("1", [tbm], satz_id="satz-2"),
                    ],
                )
            ]
        )
        result = extract_tbms_for_satz(norm, "satz-2")
        assert len(result) == 1
        assert result[0]["prueffrage"] == "Q2?"


# ---------------------------------------------------------------------------
# filter_documents
# ---------------------------------------------------------------------------


class TestFilterDocuments:
    """Tests for filter_documents removing blocklisted Header 1 entries."""

    def test_blocks_inhaltsverzeichnis(self) -> None:
        docs = [{"Header 1": "Inhaltsverzeichnis", "title": "A"}]
        assert filter_documents(docs) == []

    def test_blocks_literaturverzeichnis(self) -> None:
        docs = [{"Header 1": "Das Literaturverzeichnis", "title": "A"}]
        assert filter_documents(docs) == []

    def test_passes_normal_header(self) -> None:
        docs = [{"Header 1": "Umweltverträglichkeitsprüfung", "title": "A"}]
        result = filter_documents(docs)
        assert len(result) == 1

    def test_missing_header_passes(self) -> None:
        docs: list[dict[str, Any]] = [{"title": "X"}]
        result = filter_documents(docs)
        assert len(result) == 1


# ---------------------------------------------------------------------------
# fuse_retrieval_results
# ---------------------------------------------------------------------------


class TestFuseRetrievalResults:
    """Tests for fuse_retrieval_results merging multiple retrieval sources per TBM."""

    def test_single_tbm_single_source(self) -> None:
        tbm_list = [{"prueffrage": "Q?"}]
        chunks = [[{"document_id": "d1", "title": "A", "score": 0.9}]]
        enriched = fuse_retrieval_results(
            tbm_list,
            source_chunks=chunks,
            source_summaries=[[]],
            source_questions=[[]],
            source_rules=[[]],
        )
        assert len(enriched) == 1
        assert "svms" in enriched[0]
        assert enriched[0]["prueffrage"] == "Q?"

    def test_rule_based_added_if_not_duplicate(self) -> None:
        tbm_list = [{"prueffrage": "Q?"}]
        chunks = [[{"document_id": "d1", "title": "A", "score": 0.9}]]
        rules = [[{"document_id": "d2", "title": "B", "score": 0.5}]]
        enriched = fuse_retrieval_results(
            tbm_list,
            source_chunks=chunks,
            source_summaries=[[]],
            source_questions=[[]],
            source_rules=rules,
        )
        titles = {doc["title"] for doc in enriched[0]["svms"]}
        assert "B" in titles

    def test_rule_based_duplicate_not_added(self) -> None:
        """Rule-based doc with same title as existing fused doc is not duplicated."""
        tbm_list = [{"prueffrage": "Q?"}]
        chunks = [[{"document_id": "d1", "title": "Same", "score": 0.9}]]
        rules = [[{"document_id": "d2", "title": "Same", "score": 0.5}]]
        enriched = fuse_retrieval_results(
            tbm_list,
            source_chunks=chunks,
            source_summaries=[[]],
            source_questions=[[]],
            source_rules=rules,
        )
        same_titles = [d for d in enriched[0]["svms"] if d.get("title") == "Same"]
        assert len(same_titles) == 1

    def test_multiple_tbms(self) -> None:
        tbm_list = [{"prueffrage": "Q1?"}, {"prueffrage": "Q2?"}]
        chunks = [
            [{"document_id": "d1", "title": "A", "score": 0.9}],
            [{"document_id": "d2", "title": "B", "score": 0.8}],
        ]
        enriched = fuse_retrieval_results(
            tbm_list,
            source_chunks=chunks,
            source_summaries=[[], []],
            source_questions=[[], []],
            source_rules=[[], []],
        )
        assert len(enriched) == EXPECTED_TBM_LIST_COUNT
