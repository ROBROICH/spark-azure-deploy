"""Temporal activities for querying the law database API."""

import asyncio
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ConfigDict
from temporal.workflows.rechtsmethodik.types import Absatz
from temporalio import activity
from temporalio.exceptions import ApplicationError

from src.activities.utils import api_call
from src.env import ENV
from src.workflows.norm_workflow.norm_types import (
    NormDekonstruktionWorkflowInput,
    NormDekonstruktionWorkflowSatzInput,
)

LAW_DB = ENV.LAW_DATABASE


class FetchNormInput(BaseModel):
    """Input for fetching norm data by jurabk and optional paragraph number."""

    jurabk: str
    paragraph_nr: str | None = None
    bundesland: str | None = None


class FetchAbsaetzeInput(BaseModel):
    """Input for fetching Absätze by jurabk and optional paragraph/absatz filters."""

    jurabk: str
    paragraph_nr: str | None = None
    absatz_nr: str | None = None
    bundesland: str | None = None


class FetchDocumentsInput(BaseModel):
    """Input for fetching all documents with optional bundesland filter."""

    bundesland: str | None = None


class FetchDocumentBySearchTermInput(BaseModel):
    """Input for fetching a document by search term with optional bundesland filter."""

    search_term: str
    bundesland: str | None = None


class FetchDocumentByJurabkInput(BaseModel):
    """Input for fetching a document by jurabk with optional bundesland filter."""

    jurabk: str
    bundesland: str | None = None


class QueryTopKDRInput(BaseModel):
    """Input for querying top-k Drucksachen results."""

    jurabk: str
    query_text: str
    section_substrings: list[str] | None = None
    k: int | None = 10


class UTNorms(BaseModel):
    """Reference to a norm for Urteilstext queries."""

    name: str
    name_suffix: str | None = None
    paragraph: str | None = None
    absatz: str | None = None


class QueryKResultsUTInput(BaseModel):
    """Input for querying k Urteilstext results by query text and norm references."""

    query_text: str
    norms: list[UTNorms]
    k: int | None = 10
    similarity_threshold: float | None = 0.3


class QueryChunksUTInput(BaseModel):
    """Input for fetching Urteilstext chunks by Aktenzeichen and section number."""

    aktenzeichen: str
    section_number: int


class LegaldefinitionOutput(BaseModel):
    """Output data for a single Legaldefinition entry."""

    begriff: str
    definition: str
    jurabk: str
    paragraph_nr: str

    model_config = ConfigDict(frozen=True)


class DefinitionsByJurabkTitelInput(BaseModel):
    """Input for querying legal definitions by jurabk and optional titel."""

    jurabk: str
    titel: str | None = None


class DefinitionsByJurabkTitelOutput(BaseModel):
    """Output containing a list of matching legal definitions."""

    definitions: list[LegaldefinitionOutput]


class TechnischeNormOutput(BaseModel):
    """Output data for a single technische Norm entry."""

    dokument: str
    titel_de: str
    titel_en: str
    kurzbeschreibung: str


async def _post_and_validate_list(url: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    """POST JSON payload to a URL and return the response as a list, raising on non-list responses."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError(f"Expected a list, got: {type(data).__name__}.")
        return data


# http://localhost:18020/documents/
@activity.defn(name="fetch_documents")
async def _fetch_documents(activity_input: FetchDocumentsInput | None = None) -> list[dict[str, Any]]:
    """Temporal activity: GET all law documents."""
    url = LAW_DB.DOCUMENTS_URL
    params = {}
    if activity_input is not None and activity_input.bundesland is not None:
        params["bundesland"] = activity_input.bundesland

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not data:
            raise ValueError(f"Expected a non-empty list, got: {type(data).__name__}.")
        return data


async def fetch_documents(bundesland: str | None = None) -> list[dict[str, Any]]:
    return await api_call(_fetch_documents, arg=FetchDocumentsInput(bundesland=bundesland) if bundesland else None)


# http://localhost:18020/documents/search/BNatSchG
@activity.defn(name="fetch_document_by_search_term")
async def _fetch_document_by_search_term(activity_input: FetchDocumentBySearchTermInput) -> list[dict[str, Any]]:
    """Temporal activity: GET documents matching a search term."""
    url = LAW_DB.DOCUMENTS_SEARCH_TERM_URL.format(search_term=activity_input.search_term)
    params = {}
    if activity_input.bundesland is not None:
        params["bundesland"] = activity_input.bundesland

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError(f"Expected a list, got: {type(data).__name__}.")
        return data


async def fetch_document_by_search_term(search_term: str, bundesland: str | None = None) -> list[dict[str, Any]]:
    return await api_call(
        _fetch_document_by_search_term, FetchDocumentBySearchTermInput(search_term=search_term, bundesland=bundesland)
    )


# http://localhost:18020/documents/BNatSchG
@activity.defn(name="fetch_document_by_jurabk")
async def _fetch_document_by_jurabk(activity_input: FetchDocumentByJurabkInput) -> dict[str, Any]:
    """Temporal activity: GET a document by jurabk."""
    url = LAW_DB.DOCUMENTS_JURABK_URL.format(jurabk=activity_input.jurabk)
    params = {}
    if activity_input.bundesland is not None:
        params["bundesland"] = activity_input.bundesland

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        if response.status_code == httpx.codes.NOT_FOUND:
            return {}
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or not data:
            raise ValueError(f"Expected a non-empty dict, got: {type(data).__name__}.")
        return data


async def fetch_document_by_jurabk(jurabk: str, bundesland: str | None = None) -> dict[str, Any]:
    return await api_call(_fetch_document_by_jurabk, FetchDocumentByJurabkInput(jurabk=jurabk, bundesland=bundesland))


# http://localhost:18020/absatz/BNatSchG?paragraph_nr=44
@activity.defn(name="fetch_absaetze")
async def _fetch_absaetze(activity_input: FetchAbsaetzeInput) -> list[dict[str, Any]]:
    """Temporal activity: GET Absätze for a paragraph."""
    url = LAW_DB.ABSATZ_JURABK_URL.format(jurabk=activity_input.jurabk)

    params = {}
    if activity_input.paragraph_nr is not None:
        params["paragraph_nr"] = activity_input.paragraph_nr
    if activity_input.absatz_nr is not None:
        params["absatz_nr"] = activity_input.absatz_nr
    if activity_input.bundesland is not None:
        params["bundesland"] = activity_input.bundesland

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        if response.status_code == httpx.codes.NOT_FOUND:
            return []
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not data:
            raise ValueError(f"Expected a non-empty list, got: {type(data).__name__}.")
        return data


async def fetch_absaetze(activity_input: FetchAbsaetzeInput) -> list[dict[str, Any]]:
    return await api_call(_fetch_absaetze, activity_input)


# http://localhost:18020/norms/search?jurabk=BNatSchG&paragraph_nr=44
@activity.defn(name="fetch_norm")
async def _fetch_norm(activity_input: FetchNormInput) -> list[dict[str, Any]]:
    """Temporal activity: GET norm metadata by jurabk and paragraph."""
    url = LAW_DB.NORMS_SEARCH_URL
    async with httpx.AsyncClient(timeout=10.0) as client:
        params = {"jurabk": activity_input.jurabk}
        if activity_input.paragraph_nr is not None:
            params["paragraph_nr"] = activity_input.paragraph_nr
        if activity_input.bundesland is not None:
            params["bundesland"] = activity_input.bundesland

        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError(f"Expected a list, got: {type(data).__name__}.")
        return data


async def fetch_norm(activity_input: FetchNormInput) -> list[dict[str, Any]]:
    return await api_call(_fetch_norm, activity_input)


async def fetch_all_norm_data(
    norm_input: FetchNormInput,
) -> NormDekonstruktionWorkflowInput:
    """Fetch all norm data (document info, paragraph info, Absätze) and assemble workflow input."""
    docs_jurabk_info = await fetch_document_by_jurabk(norm_input.jurabk, bundesland=norm_input.bundesland)
    if not docs_jurabk_info:
        raise ApplicationError(
            f"No document found for jurabk '{norm_input.jurabk}'",
            type="DocumentNotFoundError",
            non_retryable=True,
        )

    para_info, absaetze = await asyncio.gather(
        fetch_norm(
            FetchNormInput(
                jurabk=norm_input.jurabk, paragraph_nr=norm_input.paragraph_nr, bundesland=norm_input.bundesland
            ),
        ),
        fetch_absaetze(
            FetchAbsaetzeInput(
                jurabk=norm_input.jurabk, paragraph_nr=norm_input.paragraph_nr, bundesland=norm_input.bundesland
            ),
        ),
    )

    if not para_info:
        raise ApplicationError(
            f"No norm data found for {norm_input.jurabk} §{norm_input.paragraph_nr}",
            type="NormNotFoundError",
            non_retryable=True,
        )

    absaetze_list: list[Absatz[NormDekonstruktionWorkflowSatzInput]] = []

    for absatz in absaetze:
        absaetze_list.append(
            Absatz[NormDekonstruktionWorkflowSatzInput](
                absatz_nr=absatz["absatz_nr"],
                absatz_text=absatz["absatz_text"],
                saetze=[
                    NormDekonstruktionWorkflowSatzInput(
                        satz_nr=str(satz["satz_nr"]),
                        markers=satz["markers"],
                        satz_text=satz["satz_text"],
                    )
                    for satz in absatz["saetze"]
                ],
            )
        )

    data: dict[str, Any] = {
        "gesetz": docs_jurabk_info["kurzue"],
        "jurabk": norm_input.jurabk,
        "standangaben": docs_jurabk_info["standangaben"],
        "paragraph_nr": norm_input.paragraph_nr,
        "paragraph_titel": para_info[0]["titel"],
        "paragraph_text": para_info[0]["paragraph_text"],
        "absaetze": absaetze_list,
    }

    return NormDekonstruktionWorkflowInput.model_validate(data)


# http://localhost:18021/query_top_k
@activity.defn(name="query_top_k_dr")
async def _query_top_k_dr(activity_input: QueryTopKDRInput) -> list[dict[str, Any]]:
    """Temporal activity: query top-k Drucksachen by similarity."""
    return await _post_and_validate_list(LAW_DB.QUERY_TOP_K_DR_URL, activity_input.model_dump())


async def query_top_k_dr(activity_input: QueryTopKDRInput) -> list[dict[str, Any]]:
    return await api_call(_query_top_k_dr, activity_input)


# http://localhost:18022/query_k_results
@activity.defn(name="query_k_results_ut")
async def _query_k_results_ut(activity_input: QueryKResultsUTInput) -> list[dict[str, Any]]:
    """Temporal activity: query k Urteilstext results."""
    return await _post_and_validate_list(LAW_DB.QUERY_K_RESULTS_UT_URL, activity_input.model_dump())


async def query_k_results_ut(activity_input: QueryKResultsUTInput) -> list[dict[str, Any]]:
    return await api_call(_query_k_results_ut, activity_input)


# http://localhost:18022/chunks
@activity.defn(name="query_chunks_ut")
async def _query_chunks_ut(
    activity_input: QueryChunksUTInput,
) -> list[dict[str, Any]]:
    """Temporal activity: fetch Urteilstext chunks."""
    return await _post_and_validate_list(LAW_DB.QUERY_CHUNKS_UT_URL, activity_input.model_dump())


async def query_chunks_ut(
    activity_input: QueryChunksUTInput,
) -> list[dict[str, Any]]:
    return await api_call(_query_chunks_ut, activity_input)


@activity.defn(name="ld_table_get_definitions_by_jurabk_titel")
async def _ld_table_get_definitions_by_jurabk_titel(
    activity_input: DefinitionsByJurabkTitelInput,
) -> DefinitionsByJurabkTitelOutput:
    """Temporal activity: fetch legal definitions by jurabk and titel."""
    url = ENV.LAW_DATABASE.LEGALDEFINITIONEN_JURABK_URL.format(jurabk=activity_input.jurabk)
    params = {}
    if activity_input.titel is not None:
        params["titel"] = activity_input.titel

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError(f"Expected a list, got: {type(data).__name__}.")

    definitions = [
        LegaldefinitionOutput(
            begriff=str(entry["begriff"]),
            definition=str(entry["definition"]),
            jurabk=str(entry["jurabk"]),
            paragraph_nr=str(entry["paragraph_nr"]),
        )
        for entry in data
    ]

    return DefinitionsByJurabkTitelOutput(definitions=definitions)


async def ld_table_get_definitions_by_jurabk_titel(
    activity_input: DefinitionsByJurabkTitelInput,
) -> DefinitionsByJurabkTitelOutput:
    return await api_call(_ld_table_get_definitions_by_jurabk_titel, activity_input)


@activity.defn(name="tn_table_get_by_dokument")
async def _tn_table_get_by_dokument(dokument: str) -> TechnischeNormOutput | None:
    """Temporal activity: fetch a technische Norm by dokument identifier."""
    url = ENV.LAW_DATABASE.TECHNISCHE_NORMEN_DOKUMENT_URL.format(dokument=quote(dokument, safe=""))

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        if response.status_code == httpx.codes.NOT_FOUND:
            return None
        response.raise_for_status()
        return TechnischeNormOutput.model_validate(response.json())


async def tn_table_get_by_dokument(dokument: str) -> TechnischeNormOutput | None:
    return await api_call(_tn_table_get_by_dokument, dokument)
