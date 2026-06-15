"""Tests for temporal.activities.vlm — workflow-helper queue routing."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


class TestVlmInvokeRouting:
    """vlm_invoke workflow-helper queue routing."""

    @pytest.mark.asyncio
    async def test_auto_routes_nvidia(self) -> None:
        mock = AsyncMock(return_value="vlm-response")
        with patch("temporal.activities.vlm.workflow") as wf:
            wf.execute_activity = mock
            from temporal.activities.vlm import vlm_invoke

            await vlm_invoke(
                image_b64="data",
                image_mime="image/png",
                prompt="describe",
                model="mistral/mistral-small-2506",
            )
        _, kwargs = mock.call_args
        assert kwargs["task_queue"] == "llm-mistral"
