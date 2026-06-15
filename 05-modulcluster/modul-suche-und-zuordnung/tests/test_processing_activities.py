"""
Tests for src/Activities/processing_activities.py.

The actual @activity.defn functions perform I/O (Qdrant, HTTP).
We mock the underlying retrieval/HTTP calls to test the activity logic.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.Activities.processing_activities import (
    FetchRuleBasedInput,
    RetrieveChunksInput,
    RetrieveQuestionsInput,
    RetrieveSummariesInput,
    _fetch_rule_based,
    _retrieve_chunks,
    _retrieve_questions,
    _retrieve_summaries,
)


# No precise type for "valid JSON value" in standard Python typing, so we are using Any.
def _make_mock_client(response_json: Any, method: str = "get") -> AsyncMock:
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
class TestRetrieveChunksActivity:
    """Tests for _retrieve_chunks activity with mocked Qdrant retrieval."""

    async def test_calls_batch_simple_retrieval(self) -> None:
        mock_result = [[{"document_id": "d1", "score": 0.9}]]
        with patch(
            "src.Activities.processing_activities.batch_simple_retrieval",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_retrieval:
            inp = RetrieveChunksInput(queries=["q"], embeddings=[[0.1]], project_id="p1", threshold=0.5)
            result = await _retrieve_chunks(inp)
        assert result == mock_result
        mock_retrieval.assert_awaited_once_with(["q"], [[0.1]], "p1", 0.5)

    async def test_empty_queries(self) -> None:
        with patch(
            "src.Activities.processing_activities.batch_simple_retrieval", new_callable=AsyncMock, return_value=[]
        ):
            inp = RetrieveChunksInput(queries=[], embeddings=[], project_id="p1")
            result = await _retrieve_chunks(inp)
        assert result == []


@pytest.mark.asyncio
class TestRetrieveSummariesActivity:
    """Tests for _retrieve_summaries activity with mocked retrieval."""

    async def test_calls_batch_summary_retrieval(self) -> None:
        mock_result = [[{"document_id": "d1", "score": 0.8}]]
        with patch(
            "src.Activities.processing_activities.batch_summary_retrieval",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_retrieval:
            inp = RetrieveSummariesInput(queries=["q"], embeddings=[[0.1]], project_id="p1")
            result = await _retrieve_summaries(inp)
        assert result == mock_result
        mock_retrieval.assert_awaited_once_with(["q"], [[0.1]], "p1", 0.4)


@pytest.mark.asyncio
class TestRetrieveQuestionsActivity:
    """Tests for _retrieve_questions activity with mocked retrieval."""

    async def test_calls_batch_question_retrieval(self) -> None:
        mock_result = [[{"document_id": "d1", "score": 0.7}]]
        with patch(
            "src.Activities.processing_activities.batch_hypothetical_question_retrieval",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_retrieval:
            inp = RetrieveQuestionsInput(queries=["q"], embeddings=[[0.1]], project_id="p1")
            result = await _retrieve_questions(inp)
        assert result == mock_result
        mock_retrieval.assert_awaited_once_with(["q"], [[0.1]], "p1", 0.4)


@pytest.mark.asyncio
class TestFetchRuleBasedActivity:
    """Tests for _fetch_rule_based activity with mocked HTTP call."""

    async def test_successful_fetch(self) -> None:
        mock_client = _make_mock_client([{"doc_type": "Umweltbericht"}])

        with (
            patch("src.Activities.processing_activities.httpx.AsyncClient", return_value=mock_client),
            patch("src.Activities.processing_activities.find_lookup_documents_for_tbms", return_value=[["matched"]]),
        ):
            inp = FetchRuleBasedInput(project_id="p1", tbm_list=[{"prueffrage": "Q?"}])
            result = await _fetch_rule_based(inp)
        assert result == [["matched"]]

    async def test_timeout_raises(self) -> None:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        with patch("src.Activities.processing_activities.httpx.AsyncClient", return_value=mock_client):
            inp = FetchRuleBasedInput(project_id="p1", tbm_list=[])
            with pytest.raises(RuntimeError, match="Timeout"):
                await _fetch_rule_based(inp)

    async def test_http_error_raises(self) -> None:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        error = httpx.HTTPStatusError(
            "error",
            request=httpx.Request("GET", "http://test"),
            response=httpx.Response(500, text="Internal Server Error"),
        )
        mock_client.get = AsyncMock(side_effect=error)

        with patch("src.Activities.processing_activities.httpx.AsyncClient", return_value=mock_client):
            inp = FetchRuleBasedInput(project_id="p1", tbm_list=[])
            with pytest.raises(RuntimeError, match="returned"):
                await _fetch_rule_based(inp)

    async def test_request_error_raises(self) -> None:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.RequestError("connection failed"))

        with patch("src.Activities.processing_activities.httpx.AsyncClient", return_value=mock_client):
            inp = FetchRuleBasedInput(project_id="p1", tbm_list=[])
            with pytest.raises(RuntimeError, match="Request failed"):
                await _fetch_rule_based(inp)
