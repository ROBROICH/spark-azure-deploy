# ruff: noqa: PLR2004
"""Tests for wiktionary activity — input validation and HTTP response handling."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.activities.wiktionary import (
    WikiMeaningOutput,
    _get_wiktionary_meaning,
    _safe_word_for_log,
    _strip_html,
)

_PATCH = "src.activities.wiktionary.httpx.AsyncClient"


def _make_response(
    status_code: int = 200,
    json_data: object = None,
    content: bytes | None = None,
) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.content = content if content is not None else b'{"de": []}'
    empty: list[object] = []
    resp.json.return_value = json_data if json_data is not None else {"de": empty}
    resp.request = MagicMock()
    return resp


def _mock_client(response: MagicMock) -> MagicMock:
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    client.get.return_value = response
    return client


class TestStripHtml:
    def test_removes_tags(self) -> None:
        """Tests if HTML tags are removed from the string."""
        assert _strip_html("<b>bold</b>") == "bold"

    def test_strips_whitespace(self) -> None:
        """Tests if leading and trailing whitespace is stripped."""
        assert _strip_html("  text  ") == "text"

    def test_empty_string(self) -> None:
        """Tests if an empty string input returns an empty string."""
        assert _strip_html("") == ""

    def test_nested_tags(self) -> None:
        """Tests if nested HTML tags are fully removed."""
        assert _strip_html("<a href='x'><em>link</em></a>") == "link"


class TestSafeWordForLog:
    def test_truncates_at_50_chars(self) -> None:
        """Tests if words longer than 50 characters are truncated."""
        long_word = "a" * 100
        result = _safe_word_for_log(long_word)
        assert len(result) <= 54  # repr adds quotes around 50 chars

    def test_wraps_in_repr(self) -> None:
        """Tests if the word is wrapped in repr."""
        result = _safe_word_for_log("hello")
        assert result == repr("hello")


class TestGetWiktionaryMeaningInputValidation:
    async def test_empty_word_returns_empty(self) -> None:
        """Tests if an empty word input returns an empty WikiMeaningOutput."""
        result = await _get_wiktionary_meaning("")
        assert result == WikiMeaningOutput(url="", meanings=[])

    async def test_too_long_word_returns_empty(self) -> None:
        """Tests if a word exceeding the max length returns an empty WikiMeaningOutput."""
        result = await _get_wiktionary_meaning("a" * 101)
        assert result == WikiMeaningOutput(url="", meanings=[])

    async def test_invalid_chars_returns_empty(self) -> None:
        """Tests if a word containing invalid characters returns an empty WikiMeaningOutput."""
        result = await _get_wiktionary_meaning("word<script>")
        assert result == WikiMeaningOutput(url="", meanings=[])

    async def test_word_at_max_length_is_allowed(self) -> None:
        """Tests if a word at exactly the max length is processed without error."""
        word = "a" * 100
        with patch(_PATCH, return_value=_mock_client(_make_response(200))):
            result = await _get_wiktionary_meaning(word)
        assert isinstance(result, WikiMeaningOutput)


class TestGetWiktionaryMeaningHttpHandling:
    @pytest.mark.parametrize("status_code", [429, 502, 503])
    async def test_transient_errors_raise(self, status_code: int) -> None:
        """Tests if transient HTTP errors raise an HTTPStatusError."""
        resp = _make_response(status_code)
        resp.raise_for_status = MagicMock()
        with patch(_PATCH, return_value=_mock_client(resp)), pytest.raises(httpx.HTTPStatusError):
            await _get_wiktionary_meaning("Freiheit")

    async def test_non_200_returns_empty_meanings(self) -> None:
        """Tests if a non-200 status code returns an empty meanings list."""
        with patch(_PATCH, return_value=_mock_client(_make_response(404))):
            result = await _get_wiktionary_meaning("Freiheit")
        assert result.meanings == []
        assert "Freiheit" in result.url

    async def test_oversized_response_returns_empty(self) -> None:
        """Tests if a response exceeding the size limit returns an empty meanings list."""
        resp = _make_response(200, content=b"x" * 1_000_001)
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")
        assert result.meanings == []

    async def test_invalid_json_returns_empty(self) -> None:
        """Tests if invalid JSON in the response returns an empty meanings list."""
        resp = _make_response(200)
        resp.json.side_effect = ValueError("bad json")
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")
        assert result.meanings == []

    async def test_unexpected_schema_de_not_list_returns_empty(self) -> None:
        """Tests if an unexpected schema where 'de' is not a list returns an empty meanings list."""
        resp = _make_response(200, json_data={"de": "not a list"})
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")
        assert result.meanings == []

    async def test_no_de_key_returns_empty(self) -> None:
        """Tests if a response without a 'de' key returns an empty meanings list."""
        resp = _make_response(200, json_data={"en": []})
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")
        assert result.meanings == []

    async def test_happy_path_extracts_meanings(self) -> None:
        """Tests if meanings are correctly extracted from a valid Wiktionary response."""
        payload = {
            "de": [
                {"definitions": [{"definition": "<b>Freiheit</b> bedeutet etwas."}]},
                {"definitions": [{"definition": "Zweite Definition."}]},
            ]
        }
        resp = _make_response(200, json_data=payload)
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")

        assert len(result.meanings) == 2
        assert "Freiheit bedeutet etwas." in result.meanings[0]
        assert "Zweite Definition." in result.meanings[1]

    async def test_url_contains_encoded_word(self) -> None:
        """Tests if the result URL contains the queried word."""
        resp = _make_response(200)
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")
        assert "Freiheit" in result.url

    async def test_skips_non_dict_entries(self) -> None:
        """Tests if non-dict entries in the 'de' list are skipped."""
        payload = {"de": ["not a dict", {"definitions": [{"definition": "Good."}]}]}
        resp = _make_response(200, json_data=payload)
        with patch(_PATCH, return_value=_mock_client(resp)):
            result = await _get_wiktionary_meaning("Freiheit")
        assert result.meanings == ["Good."]
