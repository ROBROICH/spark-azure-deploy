import asyncio
from asyncio import Task
from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from temporal.utils import TEMPORAL_FLUSH_INTERVAL, sliding_window, sliding_window_collect_failures

MAX_SIZE = 100
BIG_SIZE = 200
FAILING_ITEM = 2
EXPECTED_FLUSHES = 2


@pytest.fixture(autouse=True)
def _patch_workflow_wait() -> Generator[None]:
    async def _wait(fs: Any, *, return_when: str = asyncio.FIRST_COMPLETED) -> tuple[set[Task[Any]], set[Task[Any]]]:
        done, pending = await asyncio.wait(fs, return_when=return_when)
        return done, pending

    with patch("temporal.utils.workflow") as mock_wf:
        mock_wf.wait = _wait
        yield mock_wf


async def test_all_succeed() -> None:
    items = [1, 2, 3, 4, 5]

    async def double(x: int) -> int:
        return x * 2

    ok, failed = await sliding_window_collect_failures(items, double, concurrency=3)

    assert sorted(ok) == [2, 4, 6, 8, 10]
    assert failed == []


async def test_some_fail() -> None:
    items = [1, 2, 3, 4, 5]

    async def fail_on_even(x: int) -> int:
        if x % 2 == 0:
            raise ValueError(f"{x} is even")
        return x * 10

    ok, failed = await sliding_window_collect_failures(items, fail_on_even, concurrency=3)

    assert sorted(ok) == [10, 30, 50]
    assert sorted(failed) == [2, 4]


async def test_all_fail() -> None:
    items = ["a", "b", "c"]

    async def always_fail(x: str) -> str:
        raise RuntimeError("boom")

    ok, failed = await sliding_window_collect_failures(items, always_fail, concurrency=2)

    assert ok == []
    assert sorted(failed) == ["a", "b", "c"]


async def test_empty_input() -> None:
    async def noop(x: Any) -> None:
        return x

    ok, failed = await sliding_window_collect_failures([], noop, concurrency=5)

    assert ok == []
    assert failed == []


async def test_concurrency_one_sequential() -> None:
    order: list[tuple[str, int]] = []

    async def track(x: int) -> int:
        order.append(("start", x))
        await asyncio.sleep(0)
        order.append(("end", x))
        return x

    ok, failed = await sliding_window_collect_failures([1, 2, 3], track, concurrency=1)

    assert sorted(ok) == [1, 2, 3]
    assert failed == []
    assert order == [
        ("start", 1),
        ("end", 1),
        ("start", 2),
        ("end", 2),
        ("start", 3),
        ("end", 3),
    ]


async def test_concurrency_higher_than_items() -> None:
    items = [10, 20]

    async def identity(x: int) -> int:
        return x

    ok, failed = await sliding_window_collect_failures(items, identity, concurrency=100)

    assert sorted(ok) == [10, 20]
    assert failed == []


async def test_failed_items_preserve_original() -> None:
    async def fail_for_big(x: dict[str, Any]) -> str:
        if x["size"] > MAX_SIZE:
            raise ValueError("too big")
        return x["name"]

    items = [
        {"name": "small", "size": 50},
        {"name": "big", "size": BIG_SIZE},
        {"name": "medium", "size": 80},
    ]

    ok, failed = await sliding_window_collect_failures(items, fail_for_big, concurrency=2)

    assert sorted(ok) == ["medium", "small"]
    assert len(failed) == 1
    assert failed[0]["name"] == "big"
    assert failed[0]["size"] == BIG_SIZE


async def test_collect_failures_never_starts_a_flush_timer() -> None:
    sleep = AsyncMock()

    async def identity(x: int) -> int:
        return x

    with patch("temporal.utils.asyncio.sleep", sleep):
        ok, failed = await sliding_window_collect_failures(list(range(65)), identity, concurrency=100)

    assert sorted(ok) == list(range(65))
    assert failed == []
    sleep.assert_not_awaited()


async def test_sliding_window_returns_results() -> None:
    async def double(x: int) -> int:
        return x * 2

    results = await sliding_window([1, 2, 3, 4], double, concurrency=2)

    assert sorted(results) == [2, 4, 6, 8]


async def test_sliding_window_empty_input() -> None:
    async def noop(x: Any) -> Any:
        return x

    assert await sliding_window([], noop, concurrency=3) == []


async def test_sliding_window_propagates_exception() -> None:
    async def fail(x: int) -> int:
        if x == FAILING_ITEM:
            raise ValueError("boom")
        return x

    with pytest.raises(ValueError, match="boom"):
        await sliding_window([1, 2, 3], fail, concurrency=1)


async def test_sliding_window_flushes_every_interval() -> None:
    sleep = AsyncMock()

    async def identity(x: int) -> int:
        return x

    count = 2 * TEMPORAL_FLUSH_INTERVAL + 5
    with patch("temporal.utils.asyncio.sleep", sleep):
        results = await sliding_window(list(range(count)), identity, concurrency=count)

    assert sorted(results) == list(range(count))
    assert sleep.await_count == EXPECTED_FLUSHES
