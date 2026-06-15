"""Tests for law_api_calls — validation logic and fetch_all_norm_data assembly."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.activities.law_api_calls import (
    DefinitionsByJurabkTitelInput,
    FetchNormInput,
    LegaldefinitionOutput,
    _ld_table_get_definitions_by_jurabk_titel,
    _post_and_validate_list,
    _tn_table_get_by_dokument,
    fetch_all_norm_data,
)

_PATCH_GATHER = "src.activities.law_api_calls.workflow.asyncio.gather"
_PATCH_FETCH_DOC = "src.activities.law_api_calls.fetch_document_by_jurabk"
_PATCH_FETCH_NORM = "src.activities.law_api_calls.fetch_norm"
_PATCH_FETCH_ABS = "src.activities.law_api_calls.fetch_absaetze"


def _make_http_client(status: int = 200, json_data: object = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status
    empty: list[object] = []
    resp.json.return_value = json_data if json_data is not None else empty
    resp.raise_for_status = MagicMock()
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    client.post.return_value = resp
    client.get.return_value = resp
    return client


class TestPostAndValidateList:
    async def test_returns_list_on_valid_response(self) -> None:
        """Tests if a valid 200 response returns the expected list."""
        data = [{"key": "value"}]
        with patch("src.activities.law_api_calls.httpx.AsyncClient", return_value=_make_http_client(200, data)):
            result = await _post_and_validate_list("http://example.com", {})
        assert result == data

    async def test_raises_on_non_list_response(self) -> None:
        """Tests if a non-list response body raises a ValueError."""
        with (
            patch("src.activities.law_api_calls.httpx.AsyncClient", return_value=_make_http_client(200, {"key": "v"})),
            pytest.raises(ValueError, match="Expected a list"),
        ):
            await _post_and_validate_list("http://example.com", {})


class TestFetchAllNormData:
    async def test_raises_when_para_info_empty(self) -> None:
        """Tests if an empty para_info raises a ValueError."""
        standangaben: list[str] = []
        doc_info = {"kurzue": "BNatSchG", "standangaben": standangaben}
        empty_para: list[dict[str, object]] = []
        empty_abs: list[dict[str, object]] = []
        with (
            patch(_PATCH_FETCH_DOC, new_callable=AsyncMock),
            patch(_PATCH_FETCH_NORM, new_callable=AsyncMock),
            patch(_PATCH_FETCH_ABS, new_callable=AsyncMock),
            patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather,
        ):
            mock_gather.return_value = (doc_info, empty_para, empty_abs)
            with pytest.raises(ValueError, match="No norm data found"):
                await fetch_all_norm_data(FetchNormInput(jurabk="BNatSchG", paragraph_nr="44"))

    async def test_assembles_workflow_input_from_responses(self) -> None:
        """Tests if fetch_all_norm_data correctly assembles the workflow input from API responses."""
        doc_info = {"kurzue": "Bundesnaturschutzgesetz", "standangaben": [{"stand": "2024"}]}
        para_info = [{"titel": "Besondere Artenschutzvorschriften", "paragraph_text": "Freitext."}]
        absaetze = [
            {
                "absatz_nr": "1",
                "absatz_text": "Erster Absatz.",
                "saetze": [
                    {"satz_nr": 1, "markers": ["§ 44 Abs. 1 S. 1"], "satz_text": "Erster Satz."},
                ],
            }
        ]
        with (
            patch(_PATCH_FETCH_DOC, new_callable=AsyncMock),
            patch(_PATCH_FETCH_NORM, new_callable=AsyncMock),
            patch(_PATCH_FETCH_ABS, new_callable=AsyncMock),
            patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather,
        ):
            mock_gather.return_value = (doc_info, para_info, absaetze)
            result = await fetch_all_norm_data(FetchNormInput(jurabk="BNatSchG", paragraph_nr="44"))

        assert result.jurabk == "BNatSchG"
        assert result.paragraph_nr == "44"
        assert result.gesetz == "Bundesnaturschutzgesetz"
        assert result.paragraph_titel == "Besondere Artenschutzvorschriften"
        assert len(result.absaetze) == 1
        assert len(result.absaetze[0].saetze) == 1
        assert result.absaetze[0].saetze[0].satz_text == "Erster Satz."

    async def test_empty_absaetze_is_allowed(self) -> None:
        """Tests if an empty absaetze list is accepted without raising an error."""
        standangaben: list[str] = []
        doc_info = {"kurzue": "BNatSchG", "standangaben": standangaben}
        para_info = [{"titel": "Titel", "paragraph_text": "Text."}]
        empty_abs: list[dict[str, object]] = []
        with (
            patch(_PATCH_FETCH_DOC, new_callable=AsyncMock),
            patch(_PATCH_FETCH_NORM, new_callable=AsyncMock),
            patch(_PATCH_FETCH_ABS, new_callable=AsyncMock),
            patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather,
        ):
            mock_gather.return_value = (doc_info, para_info, empty_abs)
            result = await fetch_all_norm_data(FetchNormInput(jurabk="BNatSchG", paragraph_nr="44"))
        assert result.absaetze == []


class TestLdTableGetDefinitions:
    async def test_converts_list_to_output_model(self) -> None:
        """Tests if a valid list response is converted into the output model correctly."""
        raw = [{"begriff": "Anlage", "definition": "Def.", "jurabk": "BImSchG", "paragraph_nr": "3"}]
        client = _make_http_client(200, raw)
        with patch("src.activities.law_api_calls.httpx.AsyncClient", return_value=client):
            result = await _ld_table_get_definitions_by_jurabk_titel(DefinitionsByJurabkTitelInput(jurabk="BImSchG"))
        assert len(result.definitions) == 1
        assert result.definitions[0] == LegaldefinitionOutput(
            begriff="Anlage", definition="Def.", jurabk="BImSchG", paragraph_nr="3"
        )

    async def test_raises_on_non_list(self) -> None:
        """Tests if a non-list response body raises a ValueError."""
        client = _make_http_client(200, {"error": "bad"})
        with (
            patch("src.activities.law_api_calls.httpx.AsyncClient", return_value=client),
            pytest.raises(ValueError, match="Expected a list"),
        ):
            await _ld_table_get_definitions_by_jurabk_titel(DefinitionsByJurabkTitelInput(jurabk="BImSchG"))


class TestTnTableGetByDokument:
    async def test_returns_none_on_404(self) -> None:
        """Tests if a 404 response returns None."""
        client = _make_http_client(404)
        with patch("src.activities.law_api_calls.httpx.AsyncClient", return_value=client):
            result = await _tn_table_get_by_dokument("DIN EN ISO 123")
        assert result is None

    async def test_returns_model_on_200(self) -> None:
        """Tests if a 200 response returns a populated model."""
        data = {"dokument": "DIN EN 123", "titel_de": "Titel", "titel_en": "Title", "kurzbeschreibung": "Kurz."}
        client = _make_http_client(200, data)
        with patch("src.activities.law_api_calls.httpx.AsyncClient", return_value=client):
            result = await _tn_table_get_by_dokument("DIN EN 123")
        assert result is not None
        assert result.dokument == "DIN EN 123"
