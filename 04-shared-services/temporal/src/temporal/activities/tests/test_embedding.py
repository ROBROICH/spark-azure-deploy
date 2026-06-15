"""Tests for temporal.activities.embedding — workflow-helper queue routing & batching."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture()
def _mock_execute_activity() -> Generator[AsyncMock]:
    """Patch ``workflow.execute_activity`` and return the mock."""
    mock = AsyncMock(return_value=[[0.1, 0.2]])
    with patch("temporal.activities.embedding.workflow") as wf:
        wf.execute_activity = mock
        yield mock


@pytest.mark.usefixtures("_mock_execute_activity")
class TestEmbeddingInvokeRouting:
    """embedding_invoke auto-routing behaviour."""

    @pytest.mark.asyncio
    async def test_auto_routes_custom(self, _mock_execute_activity: AsyncMock) -> None:
        from temporal.activities.embedding import embedding_invoke

        await embedding_invoke(texts=["hello"], model="self-hosted/bge-m3")
        _, kwargs = _mock_execute_activity.call_args
        assert kwargs["task_queue"] == "llm-custom"

    @pytest.mark.asyncio
    async def test_auto_routes_ionos(self, _mock_execute_activity: AsyncMock) -> None:
        from temporal.activities.embedding import embedding_invoke

        await embedding_invoke(texts=["hello"], model="ionos/bge-m3")
        _, kwargs = _mock_execute_activity.call_args
        assert kwargs["task_queue"] == "llm-ionos"


@pytest.mark.usefixtures("_mock_execute_activity")
class TestEmbeddingInvokeEmpty:
    """Empty input returns early without calling the activity."""

    @pytest.mark.asyncio
    async def test_empty_texts_returns_empty(self, _mock_execute_activity: AsyncMock) -> None:
        from temporal.activities.embedding import embedding_invoke

        result = await embedding_invoke(texts=[], model="self-hosted/bge-m3")
        assert result == []
        _mock_execute_activity.assert_not_called()


@pytest.mark.usefixtures("_mock_execute_activity")
class TestEmbeddingInvokeBatching:
    """Texts are split into batches of 1000."""

    @pytest.mark.asyncio
    async def test_single_batch(self, _mock_execute_activity: AsyncMock) -> None:
        from temporal.activities.embedding import embedding_invoke

        _mock_execute_activity.return_value = [[0.1, 0.2], [0.3, 0.4]]
        result = await embedding_invoke(texts=["a", "b"], model="self-hosted/bge-m3")
        assert _mock_execute_activity.call_count == 1
        assert result == [[0.1, 0.2], [0.3, 0.4]]

    @pytest.mark.asyncio
    async def test_multiple_batches(self, _mock_execute_activity: AsyncMock) -> None:
        from temporal.activities.embedding import embedding_invoke

        batch1_result = [[float(i)] for i in range(1000)]
        batch2_result = [[float(i)] for i in range(1000, 1500)]
        _mock_execute_activity.side_effect = [batch1_result, batch2_result]

        texts = [f"text-{i}" for i in range(1500)]
        result = await embedding_invoke(texts=texts, model="self-hosted/bge-m3")

        assert _mock_execute_activity.call_count == 2
        assert len(result) == 1500
        assert result == batch1_result + batch2_result
