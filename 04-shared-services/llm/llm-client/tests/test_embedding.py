"""Tests for llm_client.embedding — Embedding activity unit tests."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from llm_client.embedding import _embedding_invoke
from openai import APIStatusError
from temporal.activities.models import EmbeddingActivityInput
from temporalio.exceptions import ApplicationError


def _make_input(**overrides: object) -> EmbeddingActivityInput:
    defaults: dict[str, Any] = {
        "texts": ["hello", "world"],
        "model": "self-hosted/bge-m3",
    }
    defaults.update(overrides)
    return EmbeddingActivityInput(**defaults)


def _mock_embedding_response(embeddings: list[list[float]]) -> AsyncMock:
    mock_resp = AsyncMock()
    mock_resp.data = [AsyncMock(embedding=emb) for emb in embeddings]
    return mock_resp


def _make_api_error(status_code: int) -> APIStatusError:
    mock_response = AsyncMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = {"error": "test"}
    mock_response.headers = {"content-type": "application/json"}
    return APIStatusError(
        message=f"HTTP {status_code}",
        response=mock_response,
        body={"error": "test"},
    )


class TestEmbeddingInvoke:
    @pytest.mark.asyncio
    async def test_returns_embeddings(self) -> None:
        embeddings = [[0.1, 0.2], [0.3, 0.4]]
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            return_value=_mock_embedding_response(embeddings)
        )

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            result = await _embedding_invoke(_make_input())

        assert result == embeddings

    @pytest.mark.asyncio
    async def test_empty_texts_returns_empty_list(self) -> None:
        mock_client = AsyncMock()

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            result = await _embedding_invoke(_make_input(texts=[]))

        assert result == []
        mock_client.embeddings.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_passes_model_and_input(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            return_value=_mock_embedding_response([[0.1]])
        )

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            await _embedding_invoke(_make_input(texts=["single"]))

        call_kwargs = mock_client.embeddings.create.call_args[1]
        assert call_kwargs["model"] == "self-hosted/bge-m3"
        assert call_kwargs["input"] == ["single"]

    @pytest.mark.asyncio
    async def test_api_400_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=_make_api_error(400))

        with (
            patch("llm_client.embedding.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _embedding_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_api_404_non_retryable(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=_make_api_error(404))

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            with pytest.raises(
                ApplicationError, match="Embedding HTTP 404"
            ) as exc_info:
                await _embedding_invoke(_make_input())
            assert exc_info.value.non_retryable

    @pytest.mark.asyncio
    async def test_api_422_non_retryable(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=_make_api_error(422))

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            with pytest.raises(
                ApplicationError, match="Embedding HTTP 422"
            ) as exc_info:
                await _embedding_invoke(_make_input())
            assert exc_info.value.non_retryable

    @pytest.mark.asyncio
    async def test_api_401_auth_error_retryable(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=_make_api_error(401))

        with (
            patch("llm_client.embedding.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _embedding_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_api_403_auth_error_retryable(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=_make_api_error(403))

        with (
            patch("llm_client.embedding.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _embedding_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_api_500_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=_make_api_error(500))

        with (
            patch("llm_client.embedding.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _embedding_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_timeout_error_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            side_effect=httpx.TimeoutException("timeout")
        )

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            with pytest.raises(httpx.TimeoutException):
                await _embedding_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_connect_error_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(
            side_effect=httpx.ConnectError("connection refused")
        )

        with patch("llm_client.embedding.get_client", return_value=mock_client):
            with pytest.raises(httpx.ConnectError):
                await _embedding_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_os_error_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(side_effect=OSError("network"))

        with (
            patch("llm_client.embedding.get_client", return_value=mock_client),
            pytest.raises(OSError),
        ):
            await _embedding_invoke(_make_input())
