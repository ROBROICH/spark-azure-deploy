"""
Processing Activities for Temporal workflows.

Granular retrieval activities — each does exactly one I/O operation.

Following the guideline:
- Activity functions start with underscore (_activity_name)
- Wrapper functions without underscore handle Temporal invocation
"""

import logging
from datetime import timedelta
from typing import Any

import httpx
from pydantic import BaseModel
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config.env import ENV
from src.tbm_matching.retrieval import (
    batch_hypothetical_question_retrieval,
    batch_simple_retrieval,
    batch_summary_retrieval,
)
from src.tbm_matching.rule_based_matching.lookup_data import LOOKUP_RULES
from src.tbm_matching.rule_based_matching.lookup_functions import find_lookup_documents_for_tbms

logger = logging.getLogger(__name__)


# =============================================================================
# INPUT TYPES
# =============================================================================


class RetrieveChunksInput(BaseModel):
    """Input for retrieve_chunks activity."""

    queries: list[str]
    embeddings: list[list[float]]
    project_id: str
    threshold: float = 0.4


class RetrieveSummariesInput(BaseModel):
    """Input for retrieve_summaries activity."""

    queries: list[str]
    embeddings: list[list[float]]
    project_id: str
    threshold: float = 0.4


class RetrieveQuestionsInput(BaseModel):
    """Input for retrieve_questions activity."""

    queries: list[str]
    embeddings: list[list[float]]
    project_id: str
    threshold: float = 0.4


class FetchRuleBasedInput(BaseModel):
    """Input for fetch_rule_based activity."""

    project_id: str
    tbm_list: list[dict[str, Any]]


# =============================================================================
# ACTIVITIES
# =============================================================================


@activity.defn(name="retrieve_chunks")
async def _retrieve_chunks(input: RetrieveChunksInput) -> list[list[dict[str, Any]]]:
    """Temporal activity: retrieve document chunks via hybrid dense+sparse search."""
    logger.info("[ACTIVITY] Retrieving chunks for project %s (%d queries)", input.project_id, len(input.queries))

    results = await batch_simple_retrieval(input.queries, input.embeddings, input.project_id, input.threshold)
    logger.info("[ACTIVITY] Chunk retrieval complete for project %s", input.project_id)
    return results


@activity.defn(name="retrieve_summaries")
async def _retrieve_summaries(input: RetrieveSummariesInput) -> list[list[dict[str, Any]]]:
    """Temporal activity: retrieve document summaries via hybrid dense+sparse search."""
    logger.info("[ACTIVITY] Retrieving summaries for project %s (%d queries)", input.project_id, len(input.queries))

    results = await batch_summary_retrieval(input.queries, input.embeddings, input.project_id, input.threshold)
    logger.info("[ACTIVITY] Summary retrieval complete for project %s", input.project_id)
    return results


@activity.defn(name="retrieve_questions")
async def _retrieve_questions(input: RetrieveQuestionsInput) -> list[list[dict[str, Any]]]:
    """Temporal activity: retrieve hypothetical question embeddings via hybrid search."""
    logger.info("[ACTIVITY] Retrieving questions for project %s (%d queries)", input.project_id, len(input.queries))

    results = await batch_hypothetical_question_retrieval(
        input.queries, input.embeddings, input.project_id, input.threshold
    )
    logger.info("[ACTIVITY] Question retrieval complete for project %s", input.project_id)
    return results


@activity.defn(name="fetch_rule_based")
async def _fetch_rule_based(input: FetchRuleBasedInput) -> list[list[dict[str, Any]]]:
    """Temporal activity: fetch rule-based document matches from the FCS API.

    Calls the FVP endpoint for ``project_id``, then runs the result through
    `find_lookup_documents_for_tbms` to produce per-TBM document lists.
    """
    logger.info("[ACTIVITY] Fetching rule-based results for project %s", input.project_id)

    url = f"{ENV.FCS.BASE_URL}/{input.project_id}"
    async with httpx.AsyncClient(timeout=ENV.FCS.TIMEOUT) as client:
        try:
            response = await client.get(url, headers={"accept": "application/json"})
            response.raise_for_status()
            doc_type_result_json = response.json()
        except httpx.TimeoutException as e:
            raise RuntimeError(f"Timeout ({ENV.FCS.TIMEOUT}s) while calling rule-based API: {url}") from e
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Rule-based API returned HTTP {e.response.status_code} for {url}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Request failed for rule-based API: {url}") from e

    results = find_lookup_documents_for_tbms(input.tbm_list, doc_type_result_json, LOOKUP_RULES)
    logger.info("[ACTIVITY] Rule-based fetch complete for project %s", input.project_id)
    return results


# =============================================================================
# ACTIVITY WRAPPERS (for use in workflows)
# =============================================================================

_RETRIEVAL_TIMEOUT = timedelta(minutes=30)
_RETRIEVAL_RETRY = RetryPolicy(
    maximum_attempts=2,
    initial_interval=timedelta(seconds=30),
    backoff_coefficient=2,
)


async def retrieve_chunks(
    queries: list[str], embeddings: list[list[float]], project_id: str, threshold: float = 0.01
) -> list[list[dict[str, Any]]]:
    """Workflow wrapper: execute the ``retrieve_chunks`` activity from a Temporal workflow."""
    return await workflow.execute_activity(
        _retrieve_chunks,
        RetrieveChunksInput(queries=queries, embeddings=embeddings, project_id=project_id, threshold=threshold),
        start_to_close_timeout=_RETRIEVAL_TIMEOUT,
        retry_policy=_RETRIEVAL_RETRY,
    )


async def retrieve_summaries(
    queries: list[str], embeddings: list[list[float]], project_id: str, threshold: float = 0.01
) -> list[list[dict[str, Any]]]:
    """Workflow wrapper: execute the ``retrieve_summaries`` activity from a Temporal workflow."""
    return await workflow.execute_activity(
        _retrieve_summaries,
        RetrieveSummariesInput(queries=queries, embeddings=embeddings, project_id=project_id, threshold=threshold),
        start_to_close_timeout=_RETRIEVAL_TIMEOUT,
        retry_policy=_RETRIEVAL_RETRY,
    )


async def retrieve_questions(
    queries: list[str], embeddings: list[list[float]], project_id: str, threshold: float = 0.01
) -> list[list[dict[str, Any]]]:
    """Workflow wrapper: execute the ``retrieve_questions`` activity from a Temporal workflow."""
    return await workflow.execute_activity(
        _retrieve_questions,
        RetrieveQuestionsInput(queries=queries, embeddings=embeddings, project_id=project_id, threshold=threshold),
        start_to_close_timeout=_RETRIEVAL_TIMEOUT,
        retry_policy=_RETRIEVAL_RETRY,
    )


async def fetch_rule_based(project_id: str, tbm_list: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Workflow wrapper: execute the ``fetch_rule_based`` activity from a Temporal workflow."""
    return await workflow.execute_activity(
        _fetch_rule_based,
        FetchRuleBasedInput(project_id=project_id, tbm_list=tbm_list),
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=_RETRIEVAL_RETRY,
    )
