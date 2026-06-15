"""Utility helpers for activity execution."""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.types import CallableAsyncSingleParam, ParamType, ReturnType


async def api_call(activity_fn: CallableAsyncSingleParam[ParamType, ReturnType], arg: ParamType) -> ReturnType:
    """Utility that wraps execute activity with sensible defaults for API requests."""
    return await workflow.execute_activity(
        activity_fn,
        arg,
        start_to_close_timeout=timedelta(seconds=30),
        retry_policy=RetryPolicy(
            initial_interval=timedelta(seconds=1),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(seconds=10),
            maximum_attempts=30,
        ),
    )

