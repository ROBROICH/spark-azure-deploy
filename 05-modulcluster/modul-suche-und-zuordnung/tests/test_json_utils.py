"""Tests for the parse_llm_json utility."""

import pytest
from pydantic import ValidationError

from src.pageindex_svm.json_utils import parse_llm_json
from src.pageindex_svm.prompts import Stage1Response, Stage2SentenceResponse

EXPECTED_SINGLE_RESULT_COUNT = 1
EXPECTED_MULTIPLE_RESULT_COUNT = 2

# ---------------------------------------------------------------------------
# Stage1Response tests
# ---------------------------------------------------------------------------


class TestParseStage1Response:
    def test_clean_json(self) -> None:
        raw = '{"node_list": [1, 2, 3]}'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [1, 2, 3]

    def test_empty_node_list(self) -> None:
        raw = '{"node_list": []}'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == []

    def test_json_in_code_fence(self) -> None:
        raw = '```json\n{"node_list": [5, 10]}\n```'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [5, 10]

    def test_json_in_plain_code_fence(self) -> None:
        raw = '```\n{"node_list": [7]}\n```'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [7]

    def test_reasoning_before_json(self) -> None:
        raw = (
            "Ich analysiere die Dokumentstruktur und identifiziere relevante Abschnitte.\n"
            "Nach Prüfung der Norm und des TBM sind folgende Abschnitte relevant:\n\n"
            '{"node_list": [0, 3, 7]}'
        )
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [0, 3, 7]

    def test_reasoning_plus_code_fence(self) -> None:
        raw = (
            "Schritt 1: Analyse der Norm...\n"
            "Schritt 2: Identifikation relevanter Abschnitte...\n\n"
            "```json\n"
            '{"node_list": [2, 4, 6]}\n'
            "```\n"
        )
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [2, 4, 6]

    def test_trailing_comma_repaired(self) -> None:
        raw = '{"node_list": [1, 2, 3,]}'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [1, 2, 3]


# ---------------------------------------------------------------------------
# Stage2SentenceResponse tests
# ---------------------------------------------------------------------------


class TestParseStage2Response:
    def test_clean_json(self) -> None:
        raw = '{"results": [{"node_id": "42", "relevant_indices": [0, 2], "begruendung": "Test"}]}'
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert len(result.results) == EXPECTED_SINGLE_RESULT_COUNT
        assert result.results[0].node_id == "42"
        assert result.results[0].relevant_indices == [0, 2]

    def test_reasoning_before_json(self) -> None:
        raw = (
            "Ich prüfe die Sätze auf Relevanz für das TBM.\n\n"
            '{"results": [{"node_id": "10", "relevant_indices": [0, 1, 3], "begruendung": "Relevant"}]}'
        )
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert result.results[0].node_id == "10"
        assert result.results[0].relevant_indices == [0, 1, 3]

    def test_multiple_chunks_in_code_fence(self) -> None:
        raw = (
            "```json\n"
            "{\n"
            '  "results": [\n'
            '    {"node_id": "1", "relevant_indices": [0], "begruendung": "A"},\n'
            '    {"node_id": "2", "relevant_indices": [1, 2], "begruendung": "B"}\n'
            "  ]\n"
            "}\n"
            "```"
        )
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert len(result.results) == EXPECTED_MULTIPLE_RESULT_COUNT


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------


class TestErrorCases:
    def test_empty_string_raises(self) -> None:
        with pytest.raises(ValueError, match="empty content"):
            parse_llm_json("", Stage1Response)

    def test_whitespace_only_raises(self) -> None:
        with pytest.raises(ValueError, match="empty content"):
            parse_llm_json("   \n  ", Stage1Response)

    def test_pure_text_no_json_raises(self) -> None:
        with pytest.raises(ValueError, match="No JSON object"):
            parse_llm_json("Dies ist ein Text ohne JSON.", Stage1Response)

    def test_wrong_schema_raises_validation_error(self) -> None:
        raw = '{"results": [{"node_id": "1", "relevant_indices": [0], "begruendung": "A"}]}'
        with pytest.raises(ValidationError):
            parse_llm_json(raw, Stage1Response)
