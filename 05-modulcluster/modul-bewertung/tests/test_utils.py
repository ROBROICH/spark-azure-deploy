"""Tests für Utility-Funktionen."""

import json

import pytest
from temporalio.exceptions import ApplicationError

from src.utils.json_parsing import extract_json, parse_json_response


class TestExtractJson:
    """Tests for extract_json utility function."""
    def test_direct_json_object(self) -> None:
        """Test extracting a direct JSON object."""
        result = extract_json('{"key": "value"}')
        assert json.loads(result) == {"key": "value"}

    def test_direct_json_array(self) -> None:
        """Test extracting a direct JSON array."""
        result = extract_json('[{"id": 1}]')
        assert json.loads(result) == [{"id": 1}]

    def test_json_in_code_block(self) -> None:
        """Test extracting JSON from a code block."""
        content = 'Some text\n```json\n{"key": "value"}\n```\nMore text'
        result = extract_json(content)
        assert json.loads(result) == {"key": "value"}

    def test_json_in_output_tags(self) -> None:
        """Test extracting JSON from output tags."""
        content = '<output>\n{"key": "value"}\n</output>'
        result = extract_json(content)
        assert json.loads(result) == {"key": "value"}

    def test_last_json_block_used(self) -> None:
        """Test that the last JSON block is used."""
        content = '```json\n{"first": true}\n```\ntext\n```json\n{"second": true}\n```'
        result = extract_json(content)
        assert json.loads(result) == {"second": True}

    def test_json_with_surrounding_text(self) -> None:
        """Test parsing JSON with surrounding text."""
        content = 'Here is the result: {"key": "value"} and more text'
        result = parse_json_response(content)
        assert result == {"key": "value"}

    def test_nested_json(self) -> None:
        """Test parsing nested JSON objects."""
        obj = {"outer": {"inner": [1, 2, 3]}}
        content = f"Result: {json.dumps(obj)}"
        result = parse_json_response(content)
        assert result == obj

    def test_empty_string(self) -> None:
        """Test extracting from an empty string."""
        result = extract_json("")
        assert result == ""

    def test_no_json(self) -> None:
        """Test extracting from plain text without JSON."""
        result = extract_json("this is just plain text without json")
        assert result == "this is just plain text without json"

    def test_chain_of_verification_pattern(self) -> None:
        """Test the typical CoV output pattern: thinking + json block."""
        content = """Schritt 1: Analyse...
Schritt 2: Verifikation...
Schritt 3: Korrektur...

```json
{
  "markdown": "## Kapitel\\n\\nText [0001]",
  "used_svm_ids": ["0001"]
}
```"""
        result = extract_json(content)
        parsed = json.loads(result)
        assert "markdown" in parsed
        assert parsed["used_svm_ids"] == ["0001"]


class TestParseJsonResponse:
    """Tests for parse_json_response utility."""
    def test_valid_json(self) -> None:
        """Test parsing valid JSON."""
        result = parse_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_invalid_json_raises(self) -> None:
        """Test that invalid JSON raises ApplicationError."""
        with pytest.raises(ApplicationError):
            parse_json_response("not json")

    def test_empty_response_raises(self) -> None:
        """Test that empty response raises ApplicationError."""
        with pytest.raises(ApplicationError):
            parse_json_response("")

    def test_whitespace_only_raises(self) -> None:
        """Test that whitespace-only response raises ApplicationError."""
        with pytest.raises(ApplicationError):
            parse_json_response("   \n  ")

    def test_plain_code_block_without_json_marker(self) -> None:
        """Teste Extraktion aus ``` Block ohne json-Marker."""
        content = 'Some text\n```\n{"key": "value"}\n```\nMore text'
        result = parse_json_response(content)
        assert result == {"key": "value"}


class TestMissingClosingFence:
    """Regression tests for issue #44: LLM omits the closing ``` fence."""

    def test_json_block_without_closing_fence(self) -> None:
        """Prose with brackets before an unclosed ```json block must not leak into the result."""
        content = (
            'Ich prüfe [Kapitel 3] und [Kapitel 7].\n\n```json\n{"key": "value"}\n'
        )
        assert parse_json_response(content) == {"key": "value"}

    def test_last_json_block_unclosed(self) -> None:
        """A closed draft block followed by an unclosed final block yields the final block."""
        content = '```json\n{"draft": true}\n```\nVerifikation [ok].\n```json\n{"final": true}'
        assert parse_json_response(content) == {"final": True}

    def test_plain_block_without_closing_fence(self) -> None:
        """An unclosed ``` block without json marker is extracted up to the end of the text."""
        content = 'Analyse [A] und [B]:\n```\n{"key": "value"}'
        assert parse_json_response(content) == {"key": "value"}

    def test_plain_blocks_last_unclosed(self) -> None:
        """With plain fences, the last opening fence wins even if it is unclosed."""
        content = '```\n{"first": 1}\n```\nText [x]\n```\n{"second": 2}\n'
        assert parse_json_response(content) == {"second": 2}

    def test_lone_trailing_fence_falls_back(self) -> None:
        """A lone closing fence (opening missing) keeps working via the full-text fallback."""
        content = '{"key": "value"}\n```'
        assert parse_json_response(content) == {"key": "value"}
