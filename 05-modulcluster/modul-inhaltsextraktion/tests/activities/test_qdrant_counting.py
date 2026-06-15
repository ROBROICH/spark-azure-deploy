"""Tests for Qdrant counting activity."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.qdrant.counting import _count_qdrant_project_points

_MOD = "src.activities.qdrant.counting"


def _mock_client(*, collection_exists: bool = True, count: int = 0) -> AsyncMock:
    client = AsyncMock()
    client.collection_exists.return_value = collection_exists
    client.count.return_value = MagicMock(count=count)
    client.close = AsyncMock()
    return client


@pytest.mark.asyncio
class TestCountQdrantProjectPoints:
    async def test_collection_does_not_exist_returns_zero(self) -> None:
        client = _mock_client(collection_exists=False)
        with patch(f"{_MOD}._get_qdrant_client", return_value=client):
            result = await _count_qdrant_project_points("proj-1")

        assert result == 0
        client.count.assert_not_awaited()
        client.close.assert_awaited_once()

    async def test_no_points_for_project_returns_zero(self) -> None:
        client = _mock_client(collection_exists=True, count=0)
        with patch(f"{_MOD}._get_qdrant_client", return_value=client):
            result = await _count_qdrant_project_points("proj-1")

        assert result == 0
        client.count.assert_awaited_once()
        client.close.assert_awaited_once()

    async def test_has_points_returns_count(self) -> None:
        client = _mock_client(collection_exists=True, count=150)
        with patch(f"{_MOD}._get_qdrant_client", return_value=client):
            result = await _count_qdrant_project_points("proj-1")

        assert result == 150
        # Verify the filter includes project_id and excludes is_deleted
        call_kwargs = client.count.call_args.kwargs
        count_filter = call_kwargs["count_filter"]
        assert len(count_filter.must) == 1
        assert count_filter.must[0].key == "project_id"
        assert len(count_filter.must_not) == 1
        assert count_filter.must_not[0].key == "is_deleted"

    async def test_client_always_closed(self) -> None:
        """Client is closed even if count raises."""
        client = _mock_client(collection_exists=True)
        client.count.side_effect = RuntimeError("connection lost")
        with (
            patch(f"{_MOD}._get_qdrant_client", return_value=client),
            pytest.raises(RuntimeError, match="connection lost"),
        ):
            await _count_qdrant_project_points("proj-1")

        client.close.assert_awaited_once()
