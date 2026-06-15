# ruff: noqa: PLR2004
"""Tests for UrteileKontextRetrievalAgentWorkflow static/class methods."""

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UTChunk,
    UTCitation,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr import (
    UrteileKontextRetrievalAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr_data_format import (
    RelevantChunk,
)

WF = UrteileKontextRetrievalAgentWorkflow


def _make_ut_chunk(
    aktenzeichen: str = "9 A 18/15",
    section_number: str = "84",
    gericht: str = "BVerwG",
    section_text: str = "Some text",
    zitierte_urteile: list[UTCitation] | None = None,
) -> UTChunk:
    return UTChunk(
        section_title="title",
        section_number=section_number,
        section_text=section_text,
        chunk_index=0,
        start_char=0,
        end_char=100,
        section_length=100,
        is_complete_section=True,
        id=1,
        doc_id="doc1",
        gericht=gericht,
        datum="2020-01-01",
        aktenzeichen=aktenzeichen,
        dokumenttyp="Urteil",
        normen=[{"name": "BNatSchG", "paragraph": "§ 44"}],
        similarity=0.9,
        zitierte_urteile=zitierte_urteile or [],
    )


class TestFilterByRelevantKeys:
    def test_filters_matching_chunks(self) -> None:
        c1 = _make_ut_chunk(aktenzeichen="9 A 18/15", section_number="84")
        c2 = _make_ut_chunk(aktenzeichen="9 A 18/15", section_number="85")
        c3 = _make_ut_chunk(aktenzeichen="7 C 3/20", section_number="10")

        relevant = [RelevantChunk(aktenzeichen="9 A 18/15", randnummer="84")]
        result = WF._filter_by_relevant_keys(ut_chunks=[c1, c2, c3], relevant_chunks_output=relevant)
        assert result == [c1]

    def test_empty_relevant_returns_empty(self) -> None:
        c1 = _make_ut_chunk()
        assert WF._filter_by_relevant_keys([c1], []) == []

    def test_no_match_returns_empty(self) -> None:
        c1 = _make_ut_chunk(aktenzeichen="9 A 18/15", section_number="84")
        relevant = [RelevantChunk(aktenzeichen="NONEXIST", randnummer="1")]
        assert WF._filter_by_relevant_keys([c1], relevant) == []


class TestDeduplicateCombined:
    def test_deduplicates_across_lists(self) -> None:
        c1 = _make_ut_chunk(aktenzeichen="A", section_number="1")
        c2 = _make_ut_chunk(aktenzeichen="B", section_number="2")
        c1_dup = _make_ut_chunk(aktenzeichen="A", section_number="1")

        result = WF._deduplicate_combined([[c1, c2], [c1_dup]], existing_keys=set())
        assert len(result) == 2
        keys = [(c.aktenzeichen, c.section_number) for c in result]
        assert ("A", "1") in keys
        assert ("B", "2") in keys

    def test_excludes_existing_keys(self) -> None:
        c1 = _make_ut_chunk(aktenzeichen="A", section_number="1")
        result = WF._deduplicate_combined([[c1]], existing_keys={("A", "1")})
        assert result == []

    def test_empty_input(self) -> None:
        assert WF._deduplicate_combined([], existing_keys=set()) == []


class TestGetUniqueCitations:
    def test_deduplicates_by_key(self) -> None:
        cit = UTCitation(aktenzeichen="9 A 18/15", randnummer="84")
        c1 = _make_ut_chunk(zitierte_urteile=[cit])
        c2 = _make_ut_chunk(zitierte_urteile=[cit])

        result = WF._get_unique_citations([c1, c2])
        assert len(result) == 1
        assert result[0].aktenzeichen == "9 A 18/15"

    def test_multiple_different_citations(self) -> None:
        cit1 = UTCitation(aktenzeichen="A", randnummer="1")
        cit2 = UTCitation(aktenzeichen="B", randnummer="2")
        c = _make_ut_chunk(zitierte_urteile=[cit1, cit2])
        result = WF._get_unique_citations([c])
        assert len(result) == 2

    def test_no_citations(self) -> None:
        c = _make_ut_chunk(zitierte_urteile=[])
        assert WF._get_unique_citations([c]) == []


class TestEnrichCitationChunksWithText:
    def test_enriches_matching_citations(self) -> None:
        cit = UTCitation(aktenzeichen="A", randnummer="10")
        source = _make_ut_chunk(aktenzeichen="X", section_number="1", zitierte_urteile=[cit])
        citation_chunk = _make_ut_chunk(aktenzeichen="A", section_number="10", section_text="Citation text here")

        result = WF._enrich_citation_chunks_with_text([source], [citation_chunk])
        assert len(result) == 1
        assert len(result[0].zitierte_urteile) == 1
        assert result[0].zitierte_urteile[0].text == "Citation text here"

    def test_no_matching_citation_removes_it(self) -> None:
        cit = UTCitation(aktenzeichen="NOMATCH", randnummer="99")
        source = _make_ut_chunk(zitierte_urteile=[cit])

        result = WF._enrich_citation_chunks_with_text([source], [])
        assert result[0].zitierte_urteile == []

    def test_multiple_texts_for_same_citation(self) -> None:
        cit = UTCitation(aktenzeichen="A", randnummer="5")
        source = _make_ut_chunk(zitierte_urteile=[cit])
        cc1 = _make_ut_chunk(aktenzeichen="A", section_number="5", section_text="Text 1")
        cc2 = _make_ut_chunk(aktenzeichen="A", section_number="5", section_text="Text 2")

        result = WF._enrich_citation_chunks_with_text([source], [cc1, cc2])
        assert len(result[0].zitierte_urteile) == 2


class TestExtractCitationsWithRn:
    def test_non_bverwg_returns_unchanged(self) -> None:
        chunk = _make_ut_chunk(gericht="BGH", section_text="BVerwG 9 A 18/15, Rn. 84")
        result = WF._extract_citations_with_rn(chunk)
        assert result.zitierte_urteile == []

    def test_bverwg_extracts_citations(self) -> None:
        chunk = _make_ut_chunk(
            gericht="BVerwG",
            section_text="vgl. BVerwG, Urteil vom 14.07.2011 - 9 A 12/10 - Rn. 91",
        )
        result = WF._extract_citations_with_rn(chunk)
        assert len(result.zitierte_urteile) >= 1
        assert result.zitierte_urteile[0].aktenzeichen == "9 A 12/10"
        assert result.zitierte_urteile[0].randnummer == "91"


class TestCalculateFinalResultsCount:
    @pytest.mark.parametrize(
        "relevant_count,expected",
        [
            (0, 10),  # max(10-0, 6) = 10, even
            (1, 10),  # max(9, 6) = 9, odd -> 10
            (2, 8),  # max(8, 6) = 8, even
            (3, 8),  # max(7, 6) = 7, odd -> 8
            (4, 6),  # max(6, 6) = 6, even
            (5, 6),  # max(5, 6) = 6, even
            (10, 6),  # max(0, 6) = 6, even
            (100, 6),  # max(-90, 6) = 6, even
        ],
    )
    def test_results_count(self, relevant_count: int, expected: int) -> None:
        assert WF._calculate_final_results_count(relevant_count) == expected


class TestCombineResults:
    def test_combines_with_limit(self) -> None:
        relevant = [_make_ut_chunk(aktenzeichen=str(i), section_number="1") for i in range(4)]
        topic = [_make_ut_chunk(aktenzeichen=f"t{i}", section_number="1") for i in range(20)]

        result = WF._combine_results(relevant, topic)
        # relevant_count=4 -> n=6
        assert len(result) == 4 + 6

    def test_empty_topic_chunks(self) -> None:
        relevant = [_make_ut_chunk()]
        result = WF._combine_results(relevant, [])
        assert result == relevant
