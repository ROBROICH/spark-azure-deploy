from datetime import UTC, datetime
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException, status
from pytest_httpx import HTTPXMock
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.models.schemas.legal_basis import LegalBasisLawResponse, LegalBasisNormInfoResponse, LegalBasisNormResponse
from src.services.legal_basis import (
    CachedNormDeconstruction,
    LawDbNormPayload,
    _cache_lookup_key,
    _cache_query_keys,
    _ensure_law_db_norm_can_be_materialized,
    _get_cached_norm_deconstructions,
    _topic_norm_matches,
    fetch_legal_basis_norms,
)


def _db_session() -> AsyncSession:
    return cast(AsyncSession, object())


def _legal_basis_norm_response(text: str | None) -> LegalBasisNormResponse:
    law = LegalBasisLawResponse(
        id="gesetz:BNatSchG",
        name="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
    )
    norm = LegalBasisNormInfoResponse(
        id="norm:BNatSchG:44",
        gesetz_id=law.id,
        paragraph_nr="44",
        text=text,
    )
    return LegalBasisNormResponse(
        jurabk="BNatSchG",
        paragraph_nr="44",
        gesetz=law,
        norm=norm,
        is_deconstructed=False,
    )


def test_cache_keys_include_raw_paragraph_variants() -> None:
    norms = [LawDbNormPayload(jurabk="BNatSchG", paragraph_nr="44")]

    assert _cache_query_keys(norms) == {
        ("BNatSchG", "44"),
        ("BNatSchG", "§ 44"),
        ("BNatSchG", "§44"),
    }
    assert _cache_lookup_key("BNatSchG", "44") == ("BNatSchG", "44")
    assert _cache_lookup_key("BNatSchG", "§ 44") == ("BNatSchG", "44")
    assert _cache_lookup_key("BNatSchG", " §44 ") == ("BNatSchG", "44")


def test_cache_keys_include_compact_suffix_paragraph_variants() -> None:
    norms = [LawDbNormPayload(jurabk="BayJG", paragraph_nr="31 a")]

    assert _cache_query_keys(norms) == {
        ("BayJG", "31 a"),
        ("BayJG", "31a"),
        ("BayJG", "§ 31 a"),
        ("BayJG", "§31 a"),
        ("BayJG", "§ 31a"),
        ("BayJG", "§31a"),
    }
    assert _cache_lookup_key("BayJG", "31 a") == ("BayJG", "31a")
    assert _cache_lookup_key("BayJG", "§ 31a") == ("BayJG", "31a")


def test_topic_norm_match_accepts_camel_case_and_normalized_paragraph() -> None:
    topic_id = uuid4()

    assert _topic_norm_matches(
        {
            "id": str(uuid4()),
            "topicId": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraphNr": "§ 44",
            "absatz": " 1 ",
            "satz": "2",
            "nummer": None,
        },
        topic_id=topic_id,
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz="1",
        satz="2",
        nummer=None,
    )


def test_topic_norm_match_rejects_different_optional_discriminator() -> None:
    topic_id = uuid4()

    assert not _topic_norm_matches(
        {
            "topicId": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraphNr": "44",
            "absatz": "1",
            "satz": None,
            "nummer": None,
        },
        topic_id=topic_id,
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz="2",
        satz=None,
        nummer=None,
    )


def test_materialized_project_norm_requires_law_db_text() -> None:
    _ensure_law_db_norm_can_be_materialized(_legal_basis_norm_response("Norm text"))

    with pytest.raises(HTTPException) as exc_info:
        _ensure_law_db_norm_can_be_materialized(_legal_basis_norm_response(None))

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert exc_info.value.detail == "Law database norm has no text and cannot be added to the project."


@pytest.mark.asyncio
async def test_deconstruction_cache_lookup_uses_array_bind_query_for_high_limit() -> None:
    class EmptyResult:
        def all(self) -> list[object]:
            return []

    db = AsyncMock(spec=AsyncSession)
    db.execute.return_value = EmptyResult()
    norms = [LawDbNormPayload(jurabk="BNatSchG", paragraph_nr=str(index)) for index in range(30_000)]

    result = await _get_cached_norm_deconstructions(db, norms)

    assert result == {}
    db.execute.assert_awaited_once()
    statement, params = db.execute.await_args.args
    assert "unnest" in str(statement)
    assert set(params) == {"jurabks", "paragraphs"}
    assert len(params["jurabks"]) == len(_cache_query_keys(norms))
    assert len(params["paragraphs"]) == len(_cache_query_keys(norms))


@pytest.mark.asyncio
async def test_deconstruction_cache_lookup_matches_compact_suffix_paragraph() -> None:
    cache_id = uuid4()
    cached_at = datetime(2026, 6, 22, tzinfo=UTC)

    class Result:
        def all(self) -> list[tuple[object, ...]]:
            return [(cache_id, "BayJG", "31a", cached_at)]

    db = AsyncMock(spec=AsyncSession)
    db.execute.return_value = Result()

    result = await _get_cached_norm_deconstructions(db, [LawDbNormPayload(jurabk="BayJG", paragraph_nr="31 a")])

    assert result[_cache_lookup_key("BayJG", "31 a")] == CachedNormDeconstruction(
        id=cache_id,
        jurabk="BayJG",
        paragraph="31a",
        created_at=cached_at,
    )
    params = db.execute.await_args.args[1]
    assert "31a" in params["paragraphs"]


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_returns_law_data_with_deconstruction_status(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache_id = uuid4()
    cached_at = datetime(2026, 6, 22, tzinfo=UTC)

    async def fake_cache_lookup(
        _db: AsyncSession,
        _norms: list[LawDbNormPayload],
    ) -> dict[tuple[str, str], CachedNormDeconstruction]:
        return {
            ("BNatSchG", "44"): CachedNormDeconstruction(
                id=cache_id,
                jurabk="BNatSchG",
                paragraph="44",
                created_at=cached_at,
            )
        }

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr("src.services.legal_basis._get_cached_norm_deconstructions", fake_cache_lookup)
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL(
            "http://law-db/norms/search",
            params={"include_absaetze": "false", "jurabk": "BNatSchG", "paragraph_nr": "44"},
        ),
        json=[
            {
                "jurabk": "BNatSchG",
                "paragraph_nr": "44",
                "titel": "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten",
                "paragraph_text": "Norm text",
                "doknr": "BJNR254210009",
                "prev": "43",
                "next": "45",
            }
        ],
    )
    httpx_mock.add_response(
        method="GET",
        url="http://law-db/documents/BNatSchG",
        json={
            "doknr": "BJNR254210009",
            "jurabk": "BNatSchG",
            "langue": "Gesetz ueber Naturschutz und Landschaftspflege",
            "kurzue": "Bundesnaturschutzgesetz",
            "bundesland": None,
            "doktyp": "gesetz",
            "fundstelle": "BGBl I (2009, 2542)",
            "standangaben": [{"standtyp": "Stand", "standkommentar": "Zuletzt geaendert"}],
        },
    )

    result = await fetch_legal_basis_norms(
        db=_db_session(),
        jurabk="BNatSchG",
        paragraph_nr="§ 44",
        doknr=None,
        bundesland=None,
        limit=100,
    )

    assert len(result) == 1
    assert result[0].jurabk == "BNatSchG"
    assert result[0].paragraph_nr == "44"
    assert result[0].paragraph_titel == "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten"
    assert result[0].gesetz_titel == "Gesetz ueber Naturschutz und Landschaftspflege"
    assert result[0].gesetz_kurztitel == "Bundesnaturschutzgesetz"
    assert result[0].dokument_typ == "gesetz"
    assert result[0].gesetz.name == "Bundesnaturschutzgesetz"
    assert result[0].gesetz.node_type == "gesetz"
    assert result[0].gesetz.fundstelle == "BGBl I (2009, 2542)"
    assert result[0].gesetz.standangaben[0].model_dump() == {
        "standtyp": "Stand",
        "standkommentar": "Zuletzt geaendert",
    }
    assert result[0].norm.node_type == "norm"
    assert result[0].norm.gesetz_id == result[0].gesetz.id
    assert result[0].norm.text == "Norm text"
    assert result[0].norm.prev == "43"
    assert result[0].norm.next == "45"
    assert result[0].norm.frontend_parent_ids == []
    assert result[0].norm.is_outdated is False
    assert result[0].is_deconstructed is True
    assert result[0].deconstruction_id == cache_id
    assert result[0].deconstruction_created_at == cached_at
    assert "deconstruction" not in result[0].model_dump()


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_returns_norm_text_and_missing_deconstruction(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_cache_lookup(
        _db: AsyncSession,
        _norms: list[LawDbNormPayload],
    ) -> dict[tuple[str, str], CachedNormDeconstruction]:
        return {}

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr("src.services.legal_basis._get_cached_norm_deconstructions", fake_cache_lookup)
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/norms/search", params={"include_absaetze": "false", "jurabk": "BNatSchG"}),
        json=[
            {
                "jurabk": "BNatSchG",
                "paragraph_nr": "44",
                "titel": "Titel",
                "paragraph_text": "Norm text",
                "doknr": "BJNR254210009",
                "bundesland": "NW",
                "dokument_typ": "norm",
            }
        ],
    )
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/documents/BNatSchG", params={"bundesland": "NW"}),
        json={"jurabk": "BNatSchG", "kurzue": "Bundesnaturschutzgesetz"},
    )

    result = await fetch_legal_basis_norms(
        db=_db_session(),
        jurabk="BNatSchG",
        paragraph_nr=None,
        doknr=None,
        bundesland=None,
        limit=100,
    )

    assert result[0].norm.text == "Norm text"
    assert result[0].paragraph_titel == "Titel"
    assert result[0].bundesland == "NW"
    assert result[0].dokument_typ == "norm"
    assert result[0].is_deconstructed is False
    assert result[0].deconstruction_id is None


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_allows_unfiltered_search(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_cache_lookup(
        _db: AsyncSession,
        _norms: list[LawDbNormPayload],
    ) -> dict[tuple[str, str], CachedNormDeconstruction]:
        return {}

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr("src.services.legal_basis._get_cached_norm_deconstructions", fake_cache_lookup)
    httpx_mock.add_response(
        method="GET",
        url="http://law-db/documents/",
        json=[
            {
                "doknr": "BJNR254210009",
                "jurabk": "BNatSchG",
                "langue": "Gesetz ueber Naturschutz und Landschaftspflege",
                "kurzue": "Bundesnaturschutzgesetz",
                "doktyp": "gesetz",
            },
            {
                "doknr": "BJNR000170960",
                "jurabk": "VwGO",
                "langue": "Verwaltungsgerichtsordnung",
                "kurzue": "Verwaltungsgerichtsordnung",
                "doktyp": "gesetz",
            },
        ],
    )
    httpx_mock.add_response(
        method="GET",
        url="http://law-db/toc/",
        json=[
            {
                "Title": "Allgemeine Vorschriften",
                "Ident": "Kapitel 1",
                "paragraph_nr": "44",
                "paragraph_typ": "§",
                "text": "Artenschutz",
                "doknr": "BJNR254210009",
                "jurabk": "BNatSchG",
            },
            {
                "Title": "Vollziehung",
                "Ident": "§ 80",
                "paragraph_nr": "80",
                "paragraph_typ": "§",
                "text": "Aufschiebende Wirkung",
                "doknr": "BJNR000170960",
                "jurabk": "VwGO",
            },
            {
                "Title": "Anlage",
                "Ident": "Anlage",
                "paragraph_nr": "1",
                "paragraph_typ": "Anlage",
                "text": "Not selectable",
                "doknr": "BJNR254210009",
                "jurabk": "BNatSchG",
            },
        ],
    )

    result = await fetch_legal_basis_norms(
        db=_db_session(),
        jurabk=None,
        paragraph_nr=None,
        doknr=None,
        bundesland=None,
        limit=100,
    )

    assert [norm.jurabk for norm in result] == ["BNatSchG", "VwGO"]
    assert result[0].gesetz.name == "Bundesnaturschutzgesetz"
    assert result[1].gesetz.name == "Verwaltungsgerichtsordnung"
    assert result[0].paragraph_nr == "44"
    assert result[0].paragraph_titel == "Artenschutz"
    assert result[0].gesetz.node_type == "gesetz"
    assert result[0].gesetz.id == "law-db-gesetz:bund:BNatSchG"
    assert result[0].norm.node_type == "norm"
    assert result[0].norm.id == "law-db-norm:bund:BNatSchG:44"
    assert result[0].norm.gesetz_id == result[0].gesetz.id
    assert result[0].norm.paragraph_nr == "44"
    assert result[0].norm.paragraph_titel == "Artenschutz"
    assert result[0].norm.text == "Artenschutz"
    assert result[1].norm.text == "Aufschiebende Wirkung"
    assert not any(request.url.path == "/norms/search" for request in httpx_mock.get_requests())


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_rejects_document_not_found(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_cache_lookup(
        _db: AsyncSession,
        _norms: list[LawDbNormPayload],
    ) -> dict[tuple[str, str], CachedNormDeconstruction]:
        return {}

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr("src.services.legal_basis._get_cached_norm_deconstructions", fake_cache_lookup)
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/norms/search", params={"include_absaetze": "false", "jurabk": "BNatSchG"}),
        json=[{"jurabk": "BNatSchG", "paragraph_nr": "44"}],
    )
    httpx_mock.add_response(method="GET", url="http://law-db/documents/BNatSchG", status_code=404)

    with pytest.raises(HTTPException) as exc_info:
        await fetch_legal_basis_norms(
            db=_db_session(),
            jurabk="BNatSchG",
            paragraph_nr=None,
            doknr=None,
            bundesland=None,
            limit=100,
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert exc_info.value.detail == "Law database returned status 404."


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_rejects_search_not_found(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/norms/search", params={"include_absaetze": "false", "jurabk": "BNatSchG"}),
        status_code=404,
        text="not found",
    )

    with pytest.raises(HTTPException) as exc_info:
        await fetch_legal_basis_norms(
            db=_db_session(),
            jurabk="BNatSchG",
            paragraph_nr=None,
            doknr=None,
            bundesland=None,
            limit=100,
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert exc_info.value.detail == "Law database returned status 404."


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_rejects_malformed_norm_items(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/norms/search", params={"include_absaetze": "false", "jurabk": "BNatSchG"}),
        json=[{"jurabk": "BNatSchG"}],
    )

    with pytest.raises(HTTPException) as exc_info:
        await fetch_legal_basis_norms(
            db=_db_session(),
            jurabk="BNatSchG",
            paragraph_nr=None,
            doknr=None,
            bundesland=None,
            limit=100,
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert exc_info.value.detail == "Law database returned an invalid norm payload at index 0."


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_rejects_invalid_json(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/norms/search", params={"include_absaetze": "false", "jurabk": "BNatSchG"}),
        text="not-json",
    )

    with pytest.raises(HTTPException) as exc_info:
        await fetch_legal_basis_norms(
            db=_db_session(),
            jurabk="BNatSchG",
            paragraph_nr=None,
            doknr=None,
            bundesland=None,
            limit=100,
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert exc_info.value.detail == "Law database returned invalid JSON."


@pytest.mark.asyncio
async def test_fetch_legal_basis_norms_rejects_malformed_document_payload(
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_cache_lookup(
        _db: AsyncSession,
        _norms: list[LawDbNormPayload],
    ) -> dict[tuple[str, str], CachedNormDeconstruction]:
        return {}

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr("src.services.legal_basis._get_cached_norm_deconstructions", fake_cache_lookup)
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL("http://law-db/norms/search", params={"include_absaetze": "false", "jurabk": "BNatSchG"}),
        json=[{"jurabk": "BNatSchG", "paragraph_nr": "44"}],
    )
    httpx_mock.add_response(
        method="GET",
        url="http://law-db/documents/BNatSchG",
        json=["not-a-document"],
    )

    with pytest.raises(HTTPException) as exc_info:
        await fetch_legal_basis_norms(
            db=_db_session(),
            jurabk="BNatSchG",
            paragraph_nr=None,
            doknr=None,
            bundesland=None,
            limit=100,
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert exc_info.value.detail == "Law database returned an invalid document payload."
