"""Tests for llm_client.llm — LLM activity unit tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from llm_client.llm import (
    _build_messages,
    _extract_json,
    _llm_invoke,
    _model_supports_strict_schema,
)
from temporal.activities.models import LlmActivityInput
from temporalio.exceptions import ApplicationError


class TestBuildMessages:
    def test_with_system_prompt(self) -> None:
        msgs = _build_messages("Hello", "Be nice")
        assert len(msgs) == 2
        assert msgs[0] == {"role": "system", "content": "Be nice"}
        assert msgs[1] == {"role": "user", "content": "Hello"}

    def test_without_system_prompt(self) -> None:
        msgs = _build_messages("Hello", "")
        assert len(msgs) == 1
        assert msgs[0] == {"role": "user", "content": "Hello"}

    def test_empty_prompt(self) -> None:
        msgs = _build_messages("", "System")
        assert len(msgs) == 2
        assert msgs[1] == {"role": "user", "content": ""}


class TestExtractJson:
    def test_pure_json(self) -> None:
        result = _extract_json('{"name": "test"}')
        assert result is not None
        assert json.loads(result) == {"name": "test"}

    def test_reasoning_prefix(self) -> None:
        text = 'Let me think about this.\n\n{"items": [1, 2, 3]}'
        result = _extract_json(text)
        assert result is not None
        assert json.loads(result) == {"items": [1, 2, 3]}

    def test_code_fence(self) -> None:
        text = 'Here is the result:\n```json\n{"key": "value"}\n```'
        result = _extract_json(text)
        assert result is not None
        assert json.loads(result) == {"key": "value"}

    def test_no_json_returns_none(self) -> None:
        assert _extract_json("just plain text without any json") is None

    def test_array_response(self) -> None:
        text = 'Analyzing...\n[{"a": 1}, {"a": 2}]'
        result = _extract_json(text)
        assert result is not None
        assert json.loads(result) == [{"a": 1}, {"a": 2}]

    def test_trailing_comma_repaired(self) -> None:
        text = '{"items": [1, 2, 3,]}'
        result = _extract_json(text)
        assert result is not None
        assert json.loads(result) == {"items": [1, 2, 3]}


class TestModelSupportsStrictSchema:
    def test_qwen_model(self) -> None:
        assert _model_supports_strict_schema("vertex_ai/qwen3-235b") is True
        assert _model_supports_strict_schema("hf/Qwen3-235B") is True

    def test_gpt_oss_model(self) -> None:
        assert _model_supports_strict_schema("self-hosted/gpt-oss-120b") is False

    def test_mistral_models(self) -> None:
        assert _model_supports_strict_schema("mistral/mistral-small-2506") is True
        assert _model_supports_strict_schema("mistral/ministral-14b-2512") is True

    def test_ionos_mistral_not_strict(self) -> None:
        assert (
            _model_supports_strict_schema("ionos/mistral-small-24b-instruct") is False
        )


def _make_input(**overrides: object) -> LlmActivityInput:
    defaults: dict[str, Any] = {
        "prompt": "Hello",
        "system_prompt": "Be helpful",
        "model": "mistral/mistral-small-2506",
    }
    defaults.update(overrides)
    return LlmActivityInput(**defaults)


def _mock_response(content: str = "response text") -> AsyncMock:
    mock_response = AsyncMock()
    choice = AsyncMock()
    choice.message.content = content
    mock_response.choices = [choice]
    return mock_response


class TestLlmInvoke:
    @pytest.mark.asyncio
    async def test_basic_completion(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response("result")
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            result = await _llm_invoke(_make_input())

        assert result == "result"

    @pytest.mark.asyncio
    async def test_disk_cache_reuses_response(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import llm_client.llm as llm_module

        monkeypatch.setattr(llm_module.ENV.LITELLM, "DISK_CACHE_DIR", str(tmp_path))

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response("cached result")
        )
        cache_input = _make_input()

        with patch("llm_client.llm.get_client", return_value=mock_client):
            first = await _llm_invoke(cache_input)
            second = await _llm_invoke(cache_input)

        assert first == "cached result"
        assert second == "cached result"
        assert mock_client.chat.completions.create.call_count == 1
        assert len(list(tmp_path.glob("*.json"))) == 1

    @pytest.mark.asyncio
    async def test_no_cache_bypasses_disk_cache(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import llm_client.llm as llm_module

        monkeypatch.setattr(llm_module.ENV.LITELLM, "DISK_CACHE_DIR", str(tmp_path))

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response("fresh result")
        )
        cache_input = _make_input()

        with patch("llm_client.llm.get_client", return_value=mock_client):
            first = await _llm_invoke(cache_input)
            second = await _llm_invoke(
                cache_input.model_copy(update={"no_cache": True})
            )

        assert first == "fresh result"
        assert second == "fresh result"
        assert mock_client.chat.completions.create.call_count == 2
        assert len(list(tmp_path.glob("*.json"))) == 1

    @pytest.mark.asyncio
    async def test_passes_model_and_temperature(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(temperature=0.7, top_p=0.9))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "mistral/mistral-small-2506"
        assert call_kwargs["temperature"] == 0.7
        assert call_kwargs["top_p"] == 0.9

    @pytest.mark.asyncio
    async def test_max_tokens_included_when_set(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(max_tokens=500))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["max_tokens"] == 500

    @pytest.mark.asyncio
    async def test_max_tokens_excluded_when_none(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(max_tokens=None))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert "max_tokens" not in call_kwargs

    @pytest.mark.asyncio
    async def test_reasoning_effort_included_when_set(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(reasoning_effort="high"))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["reasoning_effort"] == "high"

    @pytest.mark.asyncio
    async def test_reasoning_effort_excluded_when_none(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(reasoning_effort=None))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert "reasoning_effort" not in call_kwargs

    @pytest.mark.asyncio
    async def test_response_schema_uses_json_object_for_non_strict_model(self) -> None:
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        valid_json = json.dumps({"name": "test"})
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response(valid_json)
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            result = await _llm_invoke(
                _make_input(
                    model="self-hosted/gpt-oss-120b",
                    response_schema=schema,
                    schema_name="my_schema",
                )
            )

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["response_format"] == {"type": "json_object"}
        # Schema should be injected into system prompt
        sys_msg = call_kwargs["messages"][0]
        assert sys_msg["role"] == "system"
        assert '"type": "object"' in sys_msg["content"]
        assert result == valid_json

    @pytest.mark.asyncio
    async def test_response_schema_uses_strict_for_qwen(self) -> None:
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        valid_json = json.dumps({"name": "test"})
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response(valid_json)
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            result = await _llm_invoke(
                _make_input(
                    model="hf/qwen3-235b",
                    response_schema=schema,
                    schema_name="my_schema",
                )
            )

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["response_format"] == {
            "type": "json_schema",
            "json_schema": {
                "name": "my_schema",
                "schema": schema,
                "strict": True,
            },
        }
        # Schema should NOT be in system prompt for strict models
        sys_msg = call_kwargs["messages"][0]
        assert "JSON schema" not in sys_msg["content"]
        assert result == valid_json

    @pytest.mark.asyncio
    async def test_response_schema_default_name_qwen(self) -> None:
        schema = {"type": "object"}
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response("{}")
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(
                _make_input(model="hf/qwen3-235b", response_schema=schema)
            )

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["response_format"]["json_schema"]["name"] == "response"

    @pytest.mark.asyncio
    async def test_response_schema_invalid_json_raises(self) -> None:
        schema = {"type": "object"}
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response("not-json")
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="invalid JSON"):
                await _llm_invoke(_make_input(response_schema=schema))

    @pytest.mark.asyncio
    async def test_response_schema_extracts_json_from_reasoning_prefix(self) -> None:
        schema = {"type": "object", "properties": {"items": {"type": "array"}}}
        reasoning_with_json = (
            "We need to extract all PII per categories.\n\n"
            "Let me analyze the text carefully.\n\n"
            '{"items": [{"text": "Dr. Müller", "kategorie": "name"}]}'
        )
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response(reasoning_with_json)
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            result = await _llm_invoke(_make_input(response_schema=schema))

        parsed = json.loads(result)
        assert parsed == {"items": [{"text": "Dr. Müller", "kategorie": "name"}]}

    @pytest.mark.asyncio
    async def test_response_schema_extracts_json_from_code_fence(self) -> None:
        schema = {"type": "object"}
        content_with_fence = 'Here is the result:\n\n```json\n{"name": "test"}\n```'
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_mock_response(content_with_fence)
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            result = await _llm_invoke(_make_input(response_schema=schema))

        assert json.loads(result) == {"name": "test"}

    @pytest.mark.asyncio
    async def test_response_format_excluded_when_no_schema(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(response_schema=None))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert "response_format" not in call_kwargs

    @pytest.mark.asyncio
    async def test_empty_choices_raises(self) -> None:
        mock_resp = AsyncMock()
        mock_resp.choices = []  # pyrefly: ignore[implicit-any]
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

        with patch("llm_client.llm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="empty choices"):
                await _llm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_empty_content_raises(self) -> None:
        mock_resp = AsyncMock()
        choice = AsyncMock()
        choice.message.content = ""
        choice.message.reasoning_content = None
        # getattr fallback
        del choice.message.reasoning_content
        mock_resp.choices = [choice]
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

        with patch("llm_client.llm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="empty content"):
                await _llm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_none_content_falls_back_to_reasoning_content(self) -> None:
        mock_resp = AsyncMock()
        choice = AsyncMock()
        choice.message.content = None
        choice.message.reasoning_content = "reasoning result"
        mock_resp.choices = [choice]
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

        with patch("llm_client.llm.get_client", return_value=mock_client):
            result = await _llm_invoke(_make_input())

        assert result == "reasoning result"

    @pytest.mark.asyncio
    async def test_api_400_reraises(self) -> None:
        from openai import APIStatusError

        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": "bad request"}
        mock_response.headers = {"content-type": "application/json"}
        mock_client.chat.completions.create = AsyncMock(
            side_effect=APIStatusError(
                message="Bad request",
                response=mock_response,
                body={"error": "bad request"},
            )
        )

        with (
            patch("llm_client.llm.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _llm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_api_422_non_retryable(self) -> None:
        from openai import APIStatusError

        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 422
        mock_response.json.return_value = {"error": "unprocessable"}
        mock_response.headers = {"content-type": "application/json"}
        mock_client.chat.completions.create = AsyncMock(
            side_effect=APIStatusError(
                message="Unprocessable",
                response=mock_response,
                body={"error": "unprocessable"},
            )
        )

        with patch("llm_client.llm.get_client", return_value=mock_client):
            with pytest.raises(ApplicationError, match="LLM HTTP 422") as exc_info:
                await _llm_invoke(_make_input())
            assert exc_info.value.non_retryable

    @pytest.mark.asyncio
    async def test_api_500_reraises(self) -> None:
        from openai import APIStatusError

        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 500
        mock_response.json.return_value = {"error": "server error"}
        mock_response.headers = {"content-type": "application/json"}
        mock_client.chat.completions.create = AsyncMock(
            side_effect=APIStatusError(
                message="Server error",
                response=mock_response,
                body={"error": "server error"},
            )
        )

        with (
            patch("llm_client.llm.get_client", return_value=mock_client),
            pytest.raises(APIStatusError),
        ):
            await _llm_invoke(_make_input())

    @pytest.mark.asyncio
    async def test_builds_messages_with_system_prompt(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(prompt="Q", system_prompt="S"))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["messages"][0]["role"] == "system"
        assert call_kwargs["messages"][0]["content"] == "S"
        assert call_kwargs["messages"][1] == {"role": "user", "content": "Q"}

    @pytest.mark.asyncio
    async def test_builds_messages_without_system_prompt(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(prompt="Q", system_prompt=""))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert len(call_kwargs["messages"]) == 1
        assert call_kwargs["messages"][0] == {"role": "user", "content": "Q"}

    @pytest.mark.asyncio
    async def test_no_cache_sets_extra_body(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(no_cache=True))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["extra_body"] == {"cache": {"no-cache": True}}

    @pytest.mark.asyncio
    async def test_no_cache_false_excludes_extra_body(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(no_cache=False))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert "extra_body" not in call_kwargs

    @pytest.mark.asyncio
    async def test_no_cache_default_excludes_extra_body(self) -> None:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input())

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert "extra_body" not in call_kwargs

    @pytest.mark.asyncio
    async def test_retry_attempt_disables_cache(
        self, _mock_activity_info: MagicMock
    ) -> None:
        _mock_activity_info.attempt = 2
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response())

        with patch("llm_client.llm.get_client", return_value=mock_client):
            await _llm_invoke(_make_input(no_cache=False))

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["extra_body"] == {"cache": {"no-cache": True}}
