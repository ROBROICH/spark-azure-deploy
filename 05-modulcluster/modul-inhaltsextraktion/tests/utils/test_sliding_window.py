# tests/utils/test_sliding_window.py
"""Unit tests for the generic sliding_window utility."""

import asyncio
from asyncio import Task
from collections.abc import Generator
from typing import Any
from unittest.mock import patch

import pytest

from src.utils.sliding_window import sliding_window


@pytest.fixture(autouse=True)
def _patch_workflow_wait() -> Generator[None]:
    """Replace ``workflow.wait`` with a pure-asyncio implementation for tests."""

    async def _wait(fs: Any, *, return_when: str = asyncio.FIRST_COMPLETED) -> tuple[set[Task[Any]], set[Task[Any]]]:
        """Delegate to asyncio.wait for testing outside of Temporal."""
        done, pending = await asyncio.wait(fs, return_when=return_when)
        return done, pending

    with patch("src.utils.sliding_window.workflow") as mock_wf:
        mock_wf.wait = _wait
        yield mock_wf


async def test_all_succeed() -> None:
    """Test that all items succeed and results are collected."""
    items = [1, 2, 3, 4, 5]

    async def double(x: int) -> int:
        """Double the input value."""
        return x * 2

    ok, failed = await sliding_window(items, double, concurrency=3)

    assert sorted(ok) == [2, 4, 6, 8, 10]
    assert failed == []


async def test_some_fail() -> None:
    """Test that failed items are tracked separately from successful ones."""
    items = [1, 2, 3, 4, 5]

    async def fail_on_even(x: int) -> int:
        """Raise ValueError for even numbers."""
        if x % 2 == 0:
            raise ValueError(f"{x} is even")
        return x * 10

    ok, failed = await sliding_window(items, fail_on_even, concurrency=3)

    assert sorted(ok) == [10, 30, 50]
    assert sorted(failed) == [2, 4]


async def test_all_fail() -> None:
    """Test that all items appear in the failed list when all raise."""
    items = ["a", "b", "c"]

    async def always_fail(x: str) -> str:
        """Always raise RuntimeError."""
        raise RuntimeError("boom")

    ok, failed = await sliding_window(items, always_fail, concurrency=2)

    assert ok == []
    assert sorted(failed) == ["a", "b", "c"]


async def test_empty_input() -> None:
    """Test that empty input returns empty ok and failed lists."""

    async def noop(x: Any) -> None:
        """Return the input unchanged."""
        return x

    ok, failed = await sliding_window([], noop, concurrency=5)

    assert ok == []
    assert failed == []


async def test_concurrency_one_sequential() -> None:
    """With concurrency=1, items should be processed one at a time."""
    order: list[tuple[str, int]] = []

    async def track(x: int) -> int:
        """Track start/end ordering of each item."""
        order.append(("start", x))
        await asyncio.sleep(0)  # yield control
        order.append(("end", x))
        return x

    ok, failed = await sliding_window([1, 2, 3], track, concurrency=1)

    assert sorted(ok) == [1, 2, 3]
    assert failed == []
    # With concurrency=1, each item should start after the previous ends
    assert order == [
        ("start", 1),
        ("end", 1),
        ("start", 2),
        ("end", 2),
        ("start", 3),
        ("end", 3),
    ]


async def test_concurrency_higher_than_items() -> None:
    """Concurrency higher than item count should work fine."""
    items = [10, 20]

    async def identity(x: int) -> int:
        """Return the input unchanged."""
        return x

    ok, failed = await sliding_window(items, identity, concurrency=100)

    assert sorted(ok) == [10, 20]
    assert failed == []


async def test_failed_items_preserve_original() -> None:
    """Failed list should contain the original input items, not results."""

    async def fail_for_big(x: dict[str, Any]) -> str:
        """Raise ValueError for items with size > 100."""
        if x["size"] > 100:
            raise ValueError("too big")
        return x["name"]

    items = [
        {"name": "small", "size": 50},
        {"name": "big", "size": 200},
        {"name": "medium", "size": 80},
    ]

    ok, failed = await sliding_window(items, fail_for_big, concurrency=2)

    assert sorted(ok) == ["medium", "small"]
    assert len(failed) == 1
    assert failed[0]["name"] == "big"
    assert failed[0]["size"] == 200
