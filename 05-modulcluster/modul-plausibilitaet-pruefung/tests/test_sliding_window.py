"""Unit tests for the sliding_window concurrency utility."""

import asyncio

import pytest
from temporal.utils import sliding_window


class TestSlidingWindow:
    """Tests for the async sliding window concurrency utility."""

    @pytest.mark.asyncio
    async def test_processes_all_items(self) -> None:
        """All items are processed and returned."""
        items = [1, 2, 3, 4, 5]
        results = await sliding_window(items, self._double, concurrency=2)
        assert sorted(results) == [2, 4, 6, 8, 10]

    @pytest.mark.asyncio
    async def test_empty_input(self) -> None:
        """Empty list returns empty results."""
        results = await sliding_window([], self._double, concurrency=5)
        assert results == []

    @pytest.mark.asyncio
    async def test_concurrency_one(self) -> None:
        """Concurrency=1 processes items sequentially."""
        call_order: list[int] = []

        async def track_order(item: int) -> int:
            call_order.append(item)
            return item

        items = [1, 2, 3]
        results = await sliding_window(items, track_order, concurrency=1)

        assert sorted(results) == [1, 2, 3]
        assert len(call_order) == 3

    @pytest.mark.asyncio
    async def test_concurrency_exceeds_items(self) -> None:
        """Concurrency larger than item count works correctly."""
        items = [10, 20]
        results = await sliding_window(items, self._double, concurrency=100)
        assert sorted(results) == [20, 40]

    @pytest.mark.asyncio
    async def test_preserves_result_count(self) -> None:
        """Output length matches input length."""
        items = list(range(20))
        results = await sliding_window(items, self._double, concurrency=5)
        assert len(results) == 20

    @pytest.mark.asyncio
    async def test_single_item(self) -> None:
        """Single item is processed correctly."""
        results = await sliding_window([42], self._double, concurrency=3)
        assert results == [84]

    @staticmethod
    async def _double(x: int) -> int:
        """Simple async doubling function for tests."""
        await asyncio.sleep(0)
        return x * 2
