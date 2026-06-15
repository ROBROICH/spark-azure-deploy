# ruff: noqa: PLR2004
"""Tests for DrucksachenKontextRetrievalAgentWorkflow static methods."""

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UTCitation,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.drucksachen.dkr import (
    DrucksachenKontextRetrievalAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.drucksachen.dkr_data_format import (
    DrucksachenKontextAnalysisOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.retrieval_types import (
    FormattedDrucksachenChunk,
)

WF = DrucksachenKontextRetrievalAgentWorkflow


class TestFormatRawChunks:
    def test_basic_formatting(self) -> None:
        raw = [
            {
                "dokumentnummer": "19/4294",
                "datum": "2020-05-15",
                "section_title": "Titel A",
                "section_text": "Text A",
                "start_page": 42,
            }
        ]
        result = WF._format_raw_chunks(raw)
        assert len(result) == 1
        assert result[0].id == "0"
        assert result[0].dokumentnummer == "BT-Drs. 19/4294"
        assert result[0].datum == "2020-05-15"
        assert result[0].chunk_titel == "Titel A"
        assert result[0].chunk_text == "Text A"
        assert result[0].seite == "42"

    def test_multiple_chunks_indexed(self) -> None:
        raw = [
            {"dokumentnummer": "A", "datum": "2020-01-01", "section_title": "T", "section_text": "X", "start_page": 1},
            {"dokumentnummer": "B", "datum": "2020-01-02", "section_title": "T", "section_text": "Y", "start_page": 2},
        ]
        result = WF._format_raw_chunks(raw)
        assert result[0].id == "0"
        assert result[1].id == "1"

    def test_empty_input(self) -> None:
        assert WF._format_raw_chunks([]) == []


class TestBuildResult:
    def _make_chunk(self, id: str, datum: str = "2023-06-15") -> FormattedDrucksachenChunk:
        return FormattedDrucksachenChunk(
            id=id,
            dokumentnummer="BT-Drs. 19/4294",
            datum=datum,
            chunk_titel="Title",
            chunk_text="Content",
            seite="10",
            zitierte_urteile=[UTCitation(aktenzeichen="9 A 18/15", randnummer="84", text="cited")],
        )

    def test_filters_by_relevant_ids(self) -> None:
        c0 = self._make_chunk("0")
        c1 = self._make_chunk("1")
        c2 = self._make_chunk("2")
        filter_output = DrucksachenKontextAnalysisOutput(relevante_chunks=["0", "2"])

        result = WF._build_result([c0, c1, c2], filter_output)
        assert len(result) == 2
        assert result[0].dokumentnummer == "BT-Drs. 19/4294"
        assert result[1].dokumentnummer == "BT-Drs. 19/4294"

    def test_date_reformatted(self) -> None:
        c = self._make_chunk("0", datum="2023-06-15")
        filter_output = DrucksachenKontextAnalysisOutput(relevante_chunks=["0"])
        result = WF._build_result([c], filter_output)
        assert result[0].datum == "15.06.2023"

    def test_no_relevant_returns_empty(self) -> None:
        c = self._make_chunk("0")
        filter_output = DrucksachenKontextAnalysisOutput(relevante_chunks=["99"])
        assert WF._build_result([c], filter_output) == []

    def test_citations_preserved(self) -> None:
        c = self._make_chunk("0")
        filter_output = DrucksachenKontextAnalysisOutput(relevante_chunks=["0"])
        result = WF._build_result([c], filter_output)
        assert len(result[0].zitierte_entscheidungen) == 1
        assert result[0].zitierte_entscheidungen[0].aktenzeichen == "9 A 18/15"


class TestExtractCitationsWithRn:
    def test_extracts_bverwg_citation(self) -> None:
        text = "BVerwG, Urteil vom 14.07.2011 - 9 A 12/10 - Rn. 91"
        result = WF._extract_citations_with_rn(text)
        assert len(result) >= 1
        assert result[0].aktenzeichen == "9 A 12/10"
        assert result[0].randnummer == "91"

    def test_no_citation_returns_empty(self) -> None:
        assert WF._extract_citations_with_rn("No citations here.") == []
