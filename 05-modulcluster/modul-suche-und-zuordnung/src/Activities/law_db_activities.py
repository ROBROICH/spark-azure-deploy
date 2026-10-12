"""
Law database activities for Temporal workflows.

Covers the two similarity endpoints used by the DB-backed research workflow:
- DKE       (POST /query_top_k)
- Urteile   (POST /query_k_results)

Pattern:
- Activity functions start with underscore (_activity_name)
- Wrapper functions without underscore handle Temporal invocation
"""

from __future__ import annotations

from datetime import timedelta

from temporal.activities.law_db import (
    LawDbRows,
    QueryKResultsUTInput,
    QueryTopKDRInput,
    define_query_k_results_ut_activity,
    define_query_top_k_dr_activity,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.config.env import ENV

LAW_DB = ENV.LAW_DATABASE

_DKE_URL = f"{LAW_DB.DKE_BASE_URL}query_top_k"
_UT_URL = f"{LAW_DB.UT_BASE_URL}query_k_results"

_HTTP_TIMEOUT_SECONDS = 60.0
_START_TO_CLOSE_TIMEOUT = timedelta(seconds=60)
_RETRY_POLICY = RetryPolicy(
    maximum_attempts=30,
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2,
)


# =============================================================================
# ACTIVITIES
# =============================================================================


_query_top_k_dr = define_query_top_k_dr_activity(
    name="law_db_query_top_k_dr", url=_DKE_URL, http_timeout=_HTTP_TIMEOUT_SECONDS
)
_query_k_results_ut = define_query_k_results_ut_activity(
    name="law_db_query_k_results_ut", url=_UT_URL, http_timeout=_HTTP_TIMEOUT_SECONDS
)


# =============================================================================
# WORKFLOW WRAPPERS
# =============================================================================


async def query_top_k_dr(input: QueryTopKDRInput) -> LawDbRows:
    """Temporal workflow wrapper for _query_top_k_dr with up to 30 retries and exponential backoff."""
    return await workflow.execute_activity(
        _query_top_k_dr,
        input,
        start_to_close_timeout=_START_TO_CLOSE_TIMEOUT,
        retry_policy=_RETRY_POLICY,
    )


async def query_k_results_ut(input: QueryKResultsUTInput) -> LawDbRows:
    """Temporal workflow wrapper for _query_k_results_ut with up to 30 retries and exponential backoff."""
    return await workflow.execute_activity(
        _query_k_results_ut,
        input,
        start_to_close_timeout=_START_TO_CLOSE_TIMEOUT,
        retry_policy=_RETRY_POLICY,
    )
