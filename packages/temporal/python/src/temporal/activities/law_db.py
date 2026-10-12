import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from pydantic import BaseModel
from temporalio import activity

logger = logging.getLogger(__name__)

LawDbRows = list[dict[str, Any]]


class QueryTopKDRInput(BaseModel):
    jurabk: str
    query_text: str
    section_substrings: list[str] | None = None
    k: int | None

    def request_payload(self) -> dict[str, Any]:
        return self.model_dump()


class UTNorm(BaseModel):
    name: str
    name_suffix: str | None = None
    paragraph: str | None = None
    absatz: str | None = None


class QueryKResultsUTInput(BaseModel):
    query_text: str
    norms: list[UTNorm]
    k: int | None
    similarity_threshold: float | None = None

    def request_payload(self) -> dict[str, Any]:
        if self.similarity_threshold is None:
            return self.model_dump(exclude={"similarity_threshold"})
        return self.model_dump()


async def post_law_db_query(url: str, payload: dict[str, Any], *, http_timeout: float) -> LawDbRows:
    async with httpx.AsyncClient(timeout=http_timeout) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
    if not isinstance(data, list):
        raise ValueError(f"Expected a list, got: {type(data).__name__}.")
    if not data:
        logger.warning("Law database query %s returned no results", url)
    return data


def define_query_top_k_dr_activity(
    *, name: str, url: str, http_timeout: float
) -> Callable[[QueryTopKDRInput], Awaitable[LawDbRows]]:
    async def query_top_k_dr(activity_input: QueryTopKDRInput) -> LawDbRows:
        return await post_law_db_query(url, activity_input.request_payload(), http_timeout=http_timeout)

    return activity.defn(name=name)(query_top_k_dr)


def define_query_k_results_ut_activity(
    *, name: str, url: str, http_timeout: float
) -> Callable[[QueryKResultsUTInput], Awaitable[LawDbRows]]:
    async def query_k_results_ut(activity_input: QueryKResultsUTInput) -> LawDbRows:
        return await post_law_db_query(url, activity_input.request_payload(), http_timeout=http_timeout)

    return activity.defn(name=name)(query_k_results_ut)
