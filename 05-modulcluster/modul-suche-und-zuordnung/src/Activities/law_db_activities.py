"""
Law database activities for Temporal workflows.

Covers the three external DB endpoints used by the DB-backed research workflow:
- Laws DB   (GET  /norms/search)
- DKE       (POST /query_top_k)
- Urteile   (POST /query_k_results)

Pattern:
- Activity functions start with underscore (_activity_name)
- Wrapper functions without underscore handle Temporal invocation
"""

from __future__ import annotations

import logging
from datetime import timedelta

import httpx
from pydantic import BaseModel
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config.env import ENV

logger = logging.getLogger(__name__)

LAW_DB = ENV.LAW_DATABASE

_DKE_URL = f"{LAW_DB.DKE_BASE_URL}query_top_k"
_UT_URL = f"{LAW_DB.UT_BASE_URL}query_k_results"


# =============================================================================
# INPUT TYPES
# =============================================================================


class QueryTopKDRInput(BaseModel):
    """Input for querying the DKE law database for top-k relevant sections."""

    jurabk: str
    query_text: str
    section_substrings: list[str] | None
    k: int | None


class UTNorm(BaseModel):
    """Identifies a legal norm for filtering court judgment queries."""

    name: str
    name_suffix: str | None
    paragraph: str | None
    absatz: str | None


class QueryKResultsUTInput(BaseModel):
    """Input for querying the Urteile database for top-k relevant court judgments."""

    query_text: str
    norms: list[UTNorm]
    k: int | None


# =============================================================================
# ACTIVITIES
# =============================================================================


@activity.defn(name="law_db_query_top_k_dr")
async def _query_top_k_dr(input: QueryTopKDRInput) -> list[dict[str, object]]:
    """POST to DKE and return top-k relevant law sections, or [] if the response is empty."""
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(_DKE_URL, json=input.model_dump())
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not data:
            logger.warning("query_top_k_dr returned no results")
            return []
        return data


@activity.defn(name="law_db_query_k_results_ut")
async def _query_k_results_ut(input: QueryKResultsUTInput) -> list[dict[str, object]]:
    """POST to Urteile and return top-k relevant court judgments, or [] if the response is empty."""
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(_UT_URL, json=input.model_dump())
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not data:
            logger.warning("query_k_results_ut returned no results")
            return []
        return data


# =============================================================================
# WORKFLOW WRAPPERS
# =============================================================================


async def query_top_k_dr(input: QueryTopKDRInput) -> list[dict[str, object]]:
    """Temporal workflow wrapper for _query_top_k_dr with up to 30 retries and exponential backoff."""
    return await workflow.execute_activity(
        _query_top_k_dr,
        input,
        start_to_close_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(
            maximum_attempts=30,
            initial_interval=timedelta(seconds=5),
            backoff_coefficient=2,
        ),
    )


async def query_k_results_ut(input: QueryKResultsUTInput) -> list[dict[str, object]]:
    """Temporal workflow wrapper for _query_k_results_ut with up to 30 retries and exponential backoff."""
    return await workflow.execute_activity(
        _query_k_results_ut,
        input,
        start_to_close_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(
            maximum_attempts=30,
            initial_interval=timedelta(seconds=5),
            backoff_coefficient=2,
        ),
    )
