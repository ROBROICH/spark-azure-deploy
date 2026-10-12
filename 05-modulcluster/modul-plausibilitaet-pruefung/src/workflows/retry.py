"""Retry policies shared by the workflows."""

from datetime import timedelta

from temporalio.common import RetryPolicy

from src.config.config import config


def qdrant_retry_policy() -> RetryPolicy:
    """Long retries for Qdrant activities: recently indexed points may not be readable yet."""
    return RetryPolicy(
        maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES * 10,
        initial_interval=timedelta(seconds=10),
        backoff_coefficient=2,
        maximum_interval=timedelta(seconds=30),
    )
