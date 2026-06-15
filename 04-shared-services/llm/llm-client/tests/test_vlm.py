"""Tests for llm_client.vlm — VLM activity unit tests."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from llm_client.vlm import _vlm_invoke
from openai import APIStatusError
from temporal.activities.models import VlmActivityInput
from temporalio.exceptions import ApplicationError


def _make_input(**overrides: object) -> VlmActivityInput:
    defaults: dict[str, Any] = {
        "image_b64": "aW1hZ2VkYXRh",
        "image_mime": "image/jpeg",
        "prompt": "Describe this image",
        "model": "mistral/mistral-small-2506",
    }
    defaults.update(overrides)
    return VlmActivityInput(**defaults)


def _mock_response(content: str = "description of image") -> AsyncMock:
    mock_resp = AsyncMock()
    choice = AsyncMock()
    choice.message.content = content
    mock_resp.choices = [choice]
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


class TestVlmActivity:
    """_vlm_invoke activity unit tests."""

    @pytest.mark.asyncio
    async def test_builds_multimodal_message(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            result = await _vlm_invoke(_make_input(system_prompt="You are helpful."))

        assert result == "description of image"

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        messages = call_kwargs["messages"]

        # System message first
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are helpful."

        # User message with image and text
        assert messages[1]["role"] == "user"
        content_parts = messages[1]["content"]
        assert len(content_parts) == 2
        assert content_parts[0]["type"] == "image_url"
        assert (
            "data:image/jpeg;base64,aW1hZ2VkYXRh"
            in content_parts[0]["image_url"]["url"]
        )
        assert content_parts[1]["type"] == "text"

    @pytest.mark.asyncio
    async def test_no_system_prompt(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            await _vlm_invoke(_make_input(system_prompt=""))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        messages = call_kwargs["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"

    @pytest.mark.asyncio
    async def test_passes_model_and_temperature(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            await _vlm_invoke(_make_input(temperature=0.7, max_completion_tokens=100))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "mistral/mistral-small-2506"
        assert call_kwargs["temperature"] == 0.7
        assert call_kwargs["max_completion_tokens"] == 100

    @pytest.mark.asyncio
    async def test_api_400_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=_make_api_error(400)
        )

        with (
            patch("llm_client.vlm.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_raises_on_api_422(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=_make_api_error(422)
        )

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="VLM HTTP 422") as exc_info:
                await _vlm_invoke(_make_input())
            assert exc_info.value.non_retryable

    @pytest.mark.asyncio
    async def test_api_401_auth_error_retryable(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=_make_api_error(401)
        )

        with (
            patch("llm_client.vlm.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_api_403_auth_error_retryable(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=_make_api_error(403)
        )

        with (
            patch("llm_client.vlm.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_api_500_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=_make_api_error(500)
        )

        with (
            patch("llm_client.vlm.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_empty_choices_raises(self) -> None:
        mock_resp = AsyncMock()
        mock_resp.choices = []  # pyrefly: ignore[implicit-any]
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="empty choices"):
                await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_empty_content_raises(self) -> None:
        mock_resp = AsyncMock()
        choice = AsyncMock()
        choice.message.content = ""
        mock_resp.choices = [choice]
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="empty content"):
                await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_none_content_raises(self) -> None:
        mock_resp = AsyncMock()
        choice = AsyncMock()
        choice.message.content = None
        mock_resp.choices = [choice]
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="empty content"):
                await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_timeout_error_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=httpx.TimeoutException("timeout")
        )

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            with pytest.raises(httpx.TimeoutException):
                await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_connect_error_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=httpx.ConnectError("refused")
        )

        with (
            patch("llm_client.vlm.get_client", return_value=mock_client),
            pytest.raises(httpx.ConnectError),
        ):
            await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_os_error_reraises(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=OSError("network"))

        with (
            patch("llm_client.vlm.get_client", return_value=mock_client),
            pytest.raises(OSError),
        ):
            await _vlm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_retry_attempt_disables_cache(
        self, _mock_activity_info: MagicMock
    ) -> None:
        _mock_activity_info.attempt = 2
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.vlm.get_client", return_value=mock_client):
            await _vlm_invoke(_make_input())

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["extra_body"] == {"cache": {"no-cache": True}}
