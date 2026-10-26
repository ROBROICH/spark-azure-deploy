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

    def test_code_fence_without_closing_fence(self) -> None:
        """Regression #44: prose with brackets before an unclosed ```json block must not leak in."""
        raw = 'Ich analysiere [Abschnitt 3] und [Abschnitt 7].\n\n```json\n{"node_list": [0, 3, 7]}\n'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [0, 3, 7]

    def test_plain_code_fence_without_closing_fence(self) -> None:
        raw = 'Analyse [A]:\n```\n{"node_list": [7]}'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [7]

    def test_last_block_unclosed(self) -> None:
        raw = '```json\n{"node_list": [1]}\n```\nKorrektur [x]:\n```json\n{"node_list": [2]}'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [2]

    def test_json_fence_preferred_over_plain(self) -> None:
        raw = '```json\n{"node_list": [1]}\n```\nBeispiel:\n```\nkein JSON\n```'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [1]

    def test_lone_trailing_fence(self) -> None:
        raw = '{"node_list": [4]}\n```'
        result = parse_llm_json(raw, Stage1Response)
        assert result.node_list == [4]


# ---------------------------------------------------------------------------
# Stage2SentenceResponse tests
# ---------------------------------------------------------------------------


class TestParseStage2Response:
    def test_clean_json(self) -> None:
        raw = '{"results": [{"node_id": "42", "relevant_indices": [0, 2], "begruendung": "Test", "relevance": 0.9}]}'
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert len(result.results) == EXPECTED_SINGLE_RESULT_COUNT
        assert result.results[0].node_id == "42"
        assert result.results[0].relevant_indices == [0, 2]

    def test_reasoning_before_json(self) -> None:
        raw = (
            "Ich prüfe die Sätze auf Relevanz für das TBM.\n\n"
            '{"results": [{"node_id": "10", "relevant_indices": [0, 1, 3], "begruendung": "Relevant", "relevance": 0.7}]}'
        )
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert result.results[0].node_id == "10"
        assert result.results[0].relevant_indices == [0, 1, 3]

    def test_multiple_chunks_in_code_fence(self) -> None:
        raw = (
            "```json\n"
            "{\n"
            '  "results": [\n'
            '    {"node_id": "1", "relevant_indices": [0], "begruendung": "A", "relevance": 0.9},\n'
            '    {"node_id": "2", "relevant_indices": [1, 2], "begruendung": "B", "relevance": 0.4}\n'
            "  ]\n"
            "}\n"
            "```"
        )
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert len(result.results) == EXPECTED_MULTIPLE_RESULT_COUNT

    def test_missing_relevance_stays_absent(self) -> None:
        """A Stage 2 response without the relevance value parses and leaves the value absent."""
        raw = '{"results": [{"node_id": "42", "relevant_indices": [0], "begruendung": "Test"}]}'
        result = parse_llm_json(raw, Stage2SentenceResponse)
        assert result.results[0].relevant_indices == [0]
        assert result.results[0].relevance is None


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
