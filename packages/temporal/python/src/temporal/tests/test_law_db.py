from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from pydantic import ValidationError
from temporal.activities.law_db import (
    QueryKResultsUTInput,
    QueryTopKDRInput,
    UTNorm,
    define_query_k_results_ut_activity,
    define_query_top_k_dr_activity,
    post_law_db_query,
)
from temporalio import activity

_PATCH_CLIENT = "temporal.activities.law_db.httpx.AsyncClient"
_URL = "http://law-db.test/query"
_HTTP_TIMEOUT = 12.5
_K = 5
_THRESHOLD = 0.3


def _mock_client(response_json: object) -> AsyncMock:
    response = MagicMock()
    response.json.return_value = response_json
    response.raise_for_status = MagicMock()
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=response)
    return client


def _norm() -> UTNorm:
    return UTNorm(name="BauGB", paragraph="§ 35")


class TestInputModels:
    def test_top_k_dr_payload_keeps_contract_fields(self) -> None:
        model = QueryTopKDRInput(jurabk="BauGB", query_text="Außenbereich", k=_K)
        assert model.request_payload() == {
            "jurabk": "BauGB",
            "query_text": "Außenbereich",
            "section_substrings": None,
            "k": _K,
        }

    def test_top_k_dr_requires_k(self) -> None:
        with pytest.raises(ValidationError):
            QueryTopKDRInput.model_validate({"jurabk": "BauGB", "query_text": "q"})
        assert QueryTopKDRInput(jurabk="BauGB", query_text="q", k=None).k is None

    def test_ut_norm_optional_fields_default_to_none(self) -> None:
        norm = UTNorm(name="BauGB")
        assert (norm.name_suffix, norm.paragraph, norm.absatz) == (None, None, None)

    def test_ut_norm_requires_name(self) -> None:
        with pytest.raises(ValidationError):
            UTNorm.model_validate({})

    def test_k_results_ut_payload_omits_unset_threshold(self) -> None:
        model = QueryKResultsUTInput(query_text="q", norms=[_norm()], k=_K)
        assert model.request_payload() == {
            "query_text": "q",
            "norms": [{"name": "BauGB", "name_suffix": None, "paragraph": "§ 35", "absatz": None}],
            "k": _K,
        }

    def test_k_results_ut_payload_sends_explicit_threshold(self) -> None:
        model = QueryKResultsUTInput(query_text="q", norms=[], k=_K, similarity_threshold=_THRESHOLD)
        assert model.request_payload()["similarity_threshold"] == _THRESHOLD


@pytest.mark.asyncio
class TestPostLawDbQuery:
    async def test_returns_rows_and_uses_timeout(self) -> None:
        client = _mock_client([{"id": 1}])
        with patch(_PATCH_CLIENT, return_value=client) as client_cls:
            result = await post_law_db_query(_URL, {"a": 1}, http_timeout=_HTTP_TIMEOUT)
        assert result == [{"id": 1}]
        client_cls.assert_called_once_with(timeout=_HTTP_TIMEOUT)
        client.post.assert_called_once_with(_URL, json={"a": 1})

    async def test_empty_list_returns_empty(self) -> None:
        with patch(_PATCH_CLIENT, return_value=_mock_client([])):
            assert await post_law_db_query(_URL, {}, http_timeout=_HTTP_TIMEOUT) == []

    @pytest.mark.parametrize("body", [{"error": "x"}, None, "text"])
    async def test_non_list_response_raises(self, body: object) -> None:
        with patch(_PATCH_CLIENT, return_value=_mock_client(body)), pytest.raises(ValueError, match="Expected a list"):
            await post_law_db_query(_URL, {}, http_timeout=_HTTP_TIMEOUT)

    async def test_http_error_propagates(self) -> None:
        client = _mock_client([])
        request = httpx.Request("POST", _URL)
        client.post.return_value.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=request, response=httpx.Response(500, request=request)
        )
        with patch(_PATCH_CLIENT, return_value=client), pytest.raises(httpx.HTTPStatusError):
            await post_law_db_query(_URL, {}, http_timeout=_HTTP_TIMEOUT)


@pytest.mark.asyncio
class TestActivityFactories:
    async def test_top_k_dr_activity(self) -> None:
        fn = define_query_top_k_dr_activity(name="custom_top_k", url=_URL, http_timeout=_HTTP_TIMEOUT)
        assert activity._Definition.must_from_callable(fn).name == "custom_top_k"
        inp = QueryTopKDRInput(jurabk="BauGB", query_text="q", section_substrings=["§ 35"], k=_K)
        client = _mock_client([{"id": 1}])
        with patch(_PATCH_CLIENT, return_value=client) as client_cls:
            assert await fn(inp) == [{"id": 1}]
        client_cls.assert_called_once_with(timeout=_HTTP_TIMEOUT)
        client.post.assert_called_once_with(_URL, json=inp.request_payload())

    async def test_k_results_ut_activity(self) -> None:
        fn = define_query_k_results_ut_activity(name="custom_k_results", url=_URL, http_timeout=_HTTP_TIMEOUT)
        assert activity._Definition.must_from_callable(fn).name == "custom_k_results"
        inp = QueryKResultsUTInput(query_text="q", norms=[_norm()], k=_K, similarity_threshold=_THRESHOLD)
        client = _mock_client([])
        with patch(_PATCH_CLIENT, return_value=client):
            assert await fn(inp) == []
        client.post.assert_called_once_with(_URL, json=inp.request_payload())
