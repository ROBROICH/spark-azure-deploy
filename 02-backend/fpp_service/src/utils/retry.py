"""Retry utilities for HTTP requests."""

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)

# Retry on network errors or specific exceptions
global_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_random_exponential(multiplier=1, max=10),
    retry=retry_if_exception_type(httpx.RequestError),
    reraise=True,
)
