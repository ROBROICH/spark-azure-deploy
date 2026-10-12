"""Tests for temporal.activities.llm — workflow-helper queue routing."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture()
def _mock_execute_activity() -> Generator[AsyncMock]:
    """Patch ``workflow.execute_activity`` and return the mock."""
    mock = AsyncMock(return_value="response-text")
    with patch("temporal.activities.llm.workflow") as wf:
        wf.execute_activity = mock
        yield mock


@pytest.mark.usefixtures("_mock_execute_activity")
class TestLlmInvokeRouting:
    """llm_invoke auto-routing behaviour."""

    @pytest.mark.asyncio
    async def test_auto_routes_custom(self, _mock_execute_activity: AsyncMock) -> None:
        from temporal.activities.llm import llm_invoke

        await llm_invoke(
            prompt="hi",
            system_prompt="sys",
            model="self-hosted/gpt-oss-120b",
        )
        _, kwargs = _mock_execute_activity.call_args
        assert kwargs["task_queue"] == "llm-custom"

    def test_auto_routes_embed(self) -> None:
        from temporal.activities.models import get_queue_for_model

        assert get_queue_for_model("self-hosted/bge-m3") == "llm-custom"

    @pytest.mark.asyncio
    async def test_unknown_prefix_falls_back_to_custom(self, _mock_execute_activity: AsyncMock) -> None:
        from typing import Any, cast

        from temporal.activities.llm import llm_invoke

        await llm_invoke(
            prompt="hi",
            system_prompt="sys",
            model=cast(Any, "unknown/model"),
        )
        _, kwargs = _mock_execute_activity.call_args
        assert kwargs["task_queue"] == "llm-custom"


@pytest.mark.usefixtures("_mock_execute_activity")
class TestLlmInvokeStructuredRouting:
    """llm_invoke_structured auto-routing behaviour."""

    @pytest.mark.asyncio
    async def test_auto_routes_self_hosted(self, _mock_execute_activity: AsyncMock) -> None:
        from pydantic import BaseModel
        from temporal.activities.llm import llm_invoke_structured

        class Dummy(BaseModel):
            val: str

        _mock_execute_activity.return_value = '{"val": "ok"}'

        await llm_invoke_structured(
            prompt="hi",
            system_prompt="sys",
            output_class=Dummy,
            model="self-hosted/gpt-oss-120b",
        )
        _, kwargs = _mock_execute_activity.call_args
        assert kwargs["task_queue"] == "llm-custom"


@pytest.mark.usefixtures("_mock_execute_activity")
class TestReasoningEffort:
    """reasoning_effort is forwarded only when explicitly set."""

    @pytest.mark.asyncio
    async def test_reasoning_effort_omitted_by_default(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from temporal.activities.llm import llm_invoke

        await llm_invoke(prompt="hi", system_prompt="sys")
        args, _ = _mock_execute_activity.call_args
        activity_input = args[1]
        assert activity_input.reasoning_effort is None

    @pytest.mark.asyncio
    async def test_reasoning_effort_forwarded(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from temporal.activities.llm import llm_invoke

        await llm_invoke(
            prompt="hi",
            system_prompt="sys",
            reasoning_effort="high",
        )
        args, _ = _mock_execute_activity.call_args
        activity_input = args[1]
        assert activity_input.reasoning_effort == "high"

    @pytest.mark.asyncio
    async def test_structured_reasoning_effort_forwarded(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from pydantic import BaseModel
        from temporal.activities.llm import llm_invoke_structured

        class Dummy(BaseModel):
            val: str

        _mock_execute_activity.return_value = '{"val": "ok"}'

        await llm_invoke_structured(
            prompt="hi",
            system_prompt="sys",
            output_class=Dummy,
            reasoning_effort="medium",
        )
        args, _ = _mock_execute_activity.call_args
        activity_input = args[1]
        assert activity_input.reasoning_effort == "medium"


class TestActivityKwargsReasoningEffort:
    """_llm_invoke only includes reasoning_effort in API kwargs when set."""

    def test_input_without_reasoning_effort(self) -> None:
        from temporal.activities.models import LlmActivityInput

        inp = LlmActivityInput(
            prompt="hi", system_prompt="sys", model="self-hosted/gpt-oss-120b"
        )
        assert inp.reasoning_effort is None

    def test_input_with_reasoning_effort(self) -> None:
        from temporal.activities.models import LlmActivityInput

        inp = LlmActivityInput(
            prompt="hi",
            system_prompt="sys",
            model="self-hosted/gpt-oss-120b",
            reasoning_effort="high",
        )
        assert inp.reasoning_effort == "high"


@pytest.mark.usefixtures("_mock_execute_activity")
class TestLlmInvokeStructuredValidationRetry:
    """llm_invoke_structured retries on Pydantic validation failure."""

    @pytest.mark.asyncio
    async def test_retries_on_validation_error_then_succeeds(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from pydantic import BaseModel, field_validator
        from temporal.activities.llm import llm_invoke_structured

        class Strict(BaseModel):
            val: str

            @field_validator("val")
            @classmethod
            def must_be_ok(cls, v: str) -> str:
                if v != "ok":
                    msg = "must be ok"
                    raise ValueError(msg)
                return v

        # First call returns invalid JSON (val != "ok"), second returns valid
        _mock_execute_activity.side_effect = ['{"val": "bad"}', '{"val": "ok"}']

        result = await llm_invoke_structured(
            prompt="hi",
            system_prompt="sys",
            output_class=Strict,
        )
        assert result.val == "ok"
        assert _mock_execute_activity.call_count == 2

    @pytest.mark.asyncio
    async def test_raises_after_max_validation_attempts(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from pydantic import BaseModel, ValidationError, field_validator
        from temporal.activities.llm import llm_invoke_structured

        class Strict(BaseModel):
            val: str

            @field_validator("val")
            @classmethod
            def must_be_ok(cls, v: str) -> str:
                if v != "ok":
                    msg = "must be ok"
                    raise ValueError(msg)
                return v

        _mock_execute_activity.return_value = '{"val": "bad"}'

        with pytest.raises(ValidationError):
            await llm_invoke_structured(
                prompt="hi",
                system_prompt="sys",
                output_class=Strict,
                max_validation_attempts=2,
            )
        assert _mock_execute_activity.call_count == 2


@pytest.mark.usefixtures("_mock_execute_activity")
class TestNoCache:
    """no_cache is forwarded to LlmActivityInput."""

    @pytest.mark.asyncio
    async def test_no_cache_true_by_default(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from temporal.activities.llm import llm_invoke

        await llm_invoke(prompt="hi", system_prompt="sys")
        args, _ = _mock_execute_activity.call_args
        activity_input = args[1]
        assert activity_input.no_cache is True

    @pytest.mark.asyncio
    async def test_no_cache_forwarded(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from temporal.activities.llm import llm_invoke

        await llm_invoke(prompt="hi", system_prompt="sys", no_cache=True)
        args, _ = _mock_execute_activity.call_args
        activity_input = args[1]
        assert activity_input.no_cache is True

    @pytest.mark.asyncio
    async def test_structured_no_cache_forwarded(
        self, _mock_execute_activity: AsyncMock
    ) -> None:
        from pydantic import BaseModel
        from temporal.activities.llm import llm_invoke_structured

        class Dummy(BaseModel):
            val: str

        _mock_execute_activity.return_value = '{"val": "ok"}'

        await llm_invoke_structured(
            prompt="hi",
            system_prompt="sys",
            output_class=Dummy,
            no_cache=True,
        )
        args, _ = _mock_execute_activity.call_args
        activity_input = args[1]
        assert activity_input.no_cache is True
