"""Tests for the AsyncRateLimiter utility."""
import asyncio
import time

import pytest

from src.utils.rate_limiter import AsyncRateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_no_delay() -> None:
    """Tests that the rate limiter does not wait if the rate limit is zero."""
    limiter = AsyncRateLimiter(rate_limit=0)
    start_time = time.monotonic()
    await limiter.acquire()
    await limiter.acquire()
    end_time = time.monotonic()
    assert end_time - start_time < 0.1


@pytest.mark.asyncio
async def test_rate_limiter_with_delay() -> None:
    """Tests that the rate limiter waits for the correct amount of time."""
    # 120 requests per minute = 0.5 seconds per request
    limiter = AsyncRateLimiter(rate_limit=120)

    start_time = time.monotonic()

    tasks = [limiter.acquire() for _ in range(3)]
    await asyncio.gather(*tasks)

    end_time = time.monotonic()

    # 3 calls should take at least 2 * 0.5 = 1 second
    assert end_time - start_time >= 1.0


@pytest.mark.asyncio
async def test_rate_limiter_negative_rate_limit() -> None:
    """Tests that a negative rate limit results in no delay."""
    limiter = AsyncRateLimiter(rate_limit=-1)
    assert limiter.delay == 0
    start_time = time.monotonic()
    await limiter.acquire()
    end_time = time.monotonic()
    assert end_time - start_time < 0.1
