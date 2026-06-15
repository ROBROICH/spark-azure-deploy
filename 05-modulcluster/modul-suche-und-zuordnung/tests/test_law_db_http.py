"""
Tests for src/Activities/law_db_activities.py HTTP activity functions.

Mock httpx to test the activity logic without hitting real servers.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from internal_auth import internal_api_key_headers

import src.Activities.law_db_activities as law_db_module
from src.Activities.law_db_activities import (
    QueryKResultsUTInput,
    QueryTopKDRInput,
    UTNorm,
    _query_k_results_ut,
    _query_top_k_dr,
)


# No precise type for "valid JSON value" in standard Python typing, so we are using Any.
def _make_mock_client(response_json: Any, method: str = "post") -> AsyncMock:
    """Create a properly mocked httpx.AsyncClient with sync .json()."""
    mock_response = MagicMock()
    mock_response.json.return_value = response_json
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    setattr(mock_client, method, AsyncMock(return_value=mock_response))
    return mock_client


@pytest.mark.asyncio
class TestQueryTopKDR:
    """Tests for _query_top_k_dr activity with mocked HTTP."""

    async def test_successful_response(self) -> None:
        mock_client = _make_mock_client([{"id": 1, "text": "result"}])
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryTopKDRInput(jurabk="BauGB", query_text="test", section_substrings=None, k=5)
            result = await _query_top_k_dr(inp)
        assert result == [{"id": 1, "text": "result"}]
        mock_client.post.assert_called_once_with(
            law_db_module._DKE_URL,
            json=inp.model_dump(),
            headers=internal_api_key_headers(),
        )

    async def test_http_error_propagates(self) -> None:
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=httpx.Request("POST", "http://test"), response=httpx.Response(500)
        )
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryTopKDRInput(jurabk="BauGB", query_text="test", section_substrings=None, k=5)
            with pytest.raises(httpx.HTTPStatusError):
                await _query_top_k_dr(inp)

    async def test_empty_response_returns_empty(self) -> None:
        mock_client = _make_mock_client([])
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryTopKDRInput(jurabk="BauGB", query_text="test", section_substrings=None, k=5)
            result = await _query_top_k_dr(inp)
        assert result == []

    async def test_non_list_response_returns_empty(self) -> None:
        mock_client = _make_mock_client({"error": "not found"})
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryTopKDRInput(jurabk="BauGB", query_text="test", section_substrings=None, k=5)
            result = await _query_top_k_dr(inp)
        assert result == []


@pytest.mark.asyncio
class TestQueryKResultsUT:
    """Tests for _query_k_results_ut activity with mocked HTTP."""

    async def test_successful_response(self) -> None:
        mock_client = _make_mock_client([{"id": 1, "text": "urteil"}])
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryKResultsUTInput(
                query_text="test",
                norms=[UTNorm(name="BauGB", name_suffix=None, paragraph="35", absatz=None)],
                k=10,
            )
            result = await _query_k_results_ut(inp)
        assert result == [{"id": 1, "text": "urteil"}]
        mock_client.post.assert_called_once_with(
            law_db_module._UT_URL,
            json=inp.model_dump(),
            headers=internal_api_key_headers(),
        )

    async def test_http_error_propagates(self) -> None:
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=httpx.Request("POST", "http://test"), response=httpx.Response(500)
        )
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryKResultsUTInput(
                query_text="test",
                norms=[UTNorm(name="BauGB", name_suffix=None, paragraph="35", absatz=None)],
                k=10,
            )
            with pytest.raises(httpx.HTTPStatusError):
                await _query_k_results_ut(inp)

    async def test_empty_response_returns_empty(self) -> None:
        mock_client = _make_mock_client([])
        with patch("src.Activities.law_db_activities.httpx.AsyncClient", return_value=mock_client):
            inp = QueryKResultsUTInput(query_text="test", norms=[], k=5)
            result = await _query_k_results_ut(inp)
        assert result == []
