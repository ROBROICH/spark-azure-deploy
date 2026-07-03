from datetime import UTC, datetime
from http import HTTPStatus
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from pytest_httpx import HTTPXMock
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.api.routes import legal_basis as legal_basis_routes
from src.config.settings import settings
from src.models.db.norm_deconstruction import NormDeconstruction


def _mock_law_db_norm(
    httpx_mock: HTTPXMock,
    *,
    jurabk: str = "BNatSchG",
    paragraph_nr: str = "44",
    title: str = "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten",
    paragraph_text: str | None = "Norm text",
    doknr: str = "BJNR254210009",
    law_name: str = "Gesetz ueber Naturschutz und Landschaftspflege",
    law_short_name: str = "Bundesnaturschutzgesetz",
) -> None:
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL(
            "http://law-db/norms/search",
            params={"include_absaetze": "false", "jurabk": jurabk, "paragraph_nr": paragraph_nr},
        ),
        json=[
            {
                "jurabk": jurabk,
                "paragraph_nr": paragraph_nr,
                "titel": title,
                "paragraph_text": paragraph_text,
                "doknr": doknr,
            }
        ],
    )
    httpx_mock.add_response(
        method="GET",
        url=f"http://law-db/documents/{jurabk}",
        json={
            "doknr": doknr,
            "jurabk": jurabk,
            "langue": law_name,
            "kurzue": law_short_name,
            "doktyp": "gesetz",
        },
    )


def _mock_ambiguous_law_db_norms(httpx_mock: HTTPXMock) -> None:
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
                "titel": "Bundesrecht",
                "paragraph_text": "Bundesrecht text",
                "doknr": "BUND",
            },
            {
                "jurabk": "BNatSchG",
                "paragraph_nr": "44",
                "titel": "Landesrecht",
                "paragraph_text": "Landesrecht text",
                "doknr": "LAND",
                "bundesland": "NW",
            },
        ],
    )


def _mock_law_db_norm_selection_list(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="GET",
        url="http://law-db/documents/",
        json=[
            {
                "doknr": "BJNR254210009",
                "jurabk": "BNatSchG",
                "langue": "Gesetz ueber Naturschutz und Landschaftspflege",
                "kurzue": "Bundesnaturschutzgesetz",
                "bundesland": None,
                "doktyp": "gesetz",
                "fundstelle": "BGBl I (2009, 2542)",
            },
            {
                "doknr": "BJNR000170960",
                "jurabk": "VwGO",
                "langue": "Verwaltungsgerichtsordnung",
                "kurzue": "Verwaltungsgerichtsordnung",
                "bundesland": None,
                "doktyp": "gesetz",
                "fundstelle": "BGBl I (1991, 686)",
            },
        ],
    )
    httpx_mock.add_response(
        method="GET",
        url="http://law-db/toc/",
        json=[
            {
                "Title": "Artenschutz",
                "Ident": "§ 44",
                "paragraph_nr": "44",
                "paragraph_typ": "§",
                "text": "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten",
                "doknr": "BJNR254210009",
                "jurabk": "BNatSchG",
            },
            {
                "Title": "Aufschiebende Wirkung",
                "Ident": "§ 80",
                "paragraph_nr": "80",
                "paragraph_typ": "§",
                "text": "Aufschiebende Wirkung",
                "doknr": "BJNR000170960",
                "jurabk": "VwGO",
            },
        ],
    )


def _mock_law_db_norm_selection_entries(
    httpx_mock: HTTPXMock,
    *,
    documents: list[dict[str, Any]],
    toc_entries: list[dict[str, Any]],
    bundesland: str | None = None,
) -> None:
    documents_url = (
        httpx.URL("http://law-db/documents/", params={"bundesland": bundesland})
        if bundesland
        else httpx.URL("http://law-db/documents/")
    )
    httpx_mock.add_response(method="GET", url=documents_url, json=documents)
    httpx_mock.add_response(method="GET", url="http://law-db/toc/", json=toc_entries)


def _topic_norm_node(
    project_id: UUID,
    topic_id: UUID,
    topic_norm_id: UUID,
    *,
    jurabk: str = "BNatSchG",
    paragraph_nr: str = "44",
) -> dict[str, object]:
    return {
        "node_type": "topic_norm",
        "id": str(topic_norm_id),
        "topic_id": str(topic_id),
        "project_id": str(project_id),
        "project_version": 1,
        "jurabk": jurabk,
        "paragraph_nr": paragraph_nr,
        "type": "pruefung",
        "absatz": None,
        "satz": None,
        "nummer": None,
        "mvp_status": "unchecked",
        "satz_statuses": {},
        "frontend_parent_ids": [],
        "is_deleted": False,
        "is_outdated": False,
        "update_type": "manual",
        "created_at": "2026-06-22T10:00:00Z",
        "updated_at": "2026-06-22T10:00:00Z",
    }


def _mock_project_logic_add_topic_norm(
    httpx_mock: HTTPXMock,
    *,
    project_id: UUID,
    topic_id: UUID,
    topic_norm_id: UUID,
    jurabk: str = "BNatSchG",
    paragraph_nr: str = "44",
    include_topic_lookup: bool = True,
) -> None:
    if include_topic_lookup:
        httpx_mock.add_response(
            method="GET",
            url=f"http://project-logic/topics/{topic_id}",
            json={"id": str(topic_id), "projectId": str(project_id)},
        )
    httpx_mock.add_response(
        method="GET",
        url=f"http://project-logic/topics/{topic_id}/norms",
        json=[],
    )
    httpx_mock.add_response(
        method="POST",
        url=httpx.URL(f"http://project-logic/{project_id}/update", params={"project_version": "1"}),
        json={
            "inserted": [
                _topic_norm_node(project_id, topic_id, topic_norm_id, jurabk=jurabk, paragraph_nr=paragraph_nr)
            ],
            "updated": [],
            "deleted": [],
        },
    )


def _mock_project_logic_existing_topic_norm(
    httpx_mock: HTTPXMock,
    *,
    project_id: UUID,
    topic_id: UUID,
    topic_norm_id: UUID,
    jurabk: str = "BNatSchG",
    paragraph_nr: str = "44",
    include_topic_lookup: bool = True,
    topic_norm_summary_includes_id: bool = True,
) -> None:
    if include_topic_lookup:
        httpx_mock.add_response(
            method="GET",
            url=f"http://project-logic/topics/{topic_id}",
            json={"id": str(topic_id), "projectId": str(project_id)},
        )
    topic_norm_summary: dict[str, Any] = {
        "topicId": str(topic_id),
        "projectId": str(project_id),
        "jurabk": jurabk,
        "paragraphNr": paragraph_nr,
        "type": "pruefung",
        "mvpStatus": "unchecked",
        "satzStatuses": {},
    }
    if topic_norm_summary_includes_id:
        topic_norm_summary.update(
            {
                "id": str(topic_norm_id),
                "projectVersion": 1,
                "absatz": None,
                "satz": None,
                "nummer": None,
            }
        )
    httpx_mock.add_response(
        method="GET",
        url=f"http://project-logic/topics/{topic_id}/norms",
        json=[topic_norm_summary],
    )
    if not topic_norm_summary_includes_id:
        httpx_mock.add_response(
            method="GET",
            url=httpx.URL(f"http://project-logic/{project_id}/nodes", params={"project_version": "1"}),
            json={
                "nodes": [
                    {
                        "id": str(topic_norm_id),
                        "node_type": "topic_norm",
                        "parents": [{"id": str(topic_id), "node_type": "topic"}],
                        "frontend_parent_ids": [],
                        "is_outdated": False,
                    }
                ]
            },
        )
    httpx_mock.add_response(
        method="POST",
        url=httpx.URL(f"http://project-logic/{project_id}/batch-nodes", params={"project_version": "1"}),
        json={
            "results": [_topic_norm_node(project_id, topic_id, topic_norm_id, jurabk=jurabk, paragraph_nr=paragraph_nr)]
        },
    )


def _mock_project_logic_topic_from_other_project(
    httpx_mock: HTTPXMock,
    *,
    project_id: UUID,
    topic_id: UUID,
) -> None:
    httpx_mock.add_response(
        method="GET",
        url=f"http://project-logic/topics/{topic_id}",
        json={"id": str(topic_id), "projectId": str(project_id)},
    )


def _assert_created_bnat_schg_44_item(
    item: dict[str, object],
    *,
    project_id: UUID,
    topic_id: UUID,
    topic_norm_id: UUID,
) -> None:
    assert item["created_gesetz"] is True
    assert item["created_norm"] is True
    assert item["created_topic_norm"] is True
    assert item["is_deconstructed"] is False
    topic_norm = item["topic_norm"]
    assert isinstance(topic_norm, dict)
    assert topic_norm["node_type"] == "topic_norm"
    assert topic_norm["id"] == str(topic_norm_id)
    assert topic_norm["topic_id"] == str(topic_id)
    assert topic_norm["project_id"] == str(project_id)
    assert topic_norm["jurabk"] == "BNatSchG"
    assert topic_norm["paragraph_nr"] == "44"
    assert topic_norm["type"] == "pruefung"
    gesetz = item["gesetz"]
    assert isinstance(gesetz, dict)
    assert gesetz["node_type"] == "gesetz"
    assert gesetz["name"] == "Bundesnaturschutzgesetz"
    assert gesetz["jurabk"] == "BNatSchG"
    assert gesetz["project_id"] == str(project_id)
    assert gesetz["project_version"] == 1
    assert gesetz["update_type"] == "manual"
    norm = item["norm"]
    assert isinstance(norm, dict)
    assert norm["node_type"] == "norm"
    assert norm["gesetz_id"] == gesetz["id"]
    assert norm["paragraph_nr"] == "44"
    assert norm["paragraph_titel"] == "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten"
    assert norm["text"] == "Norm text"
    assert norm["project_id"] == str(project_id)
    assert norm["project_version"] == 1
    assert norm["update_type"] == "manual"
    assert norm["frontend_parent_ids"] == [f"topic_norm:{topic_norm_id}"]


@pytest.mark.asyncio
async def test_get_legal_basis_norms_without_filters_returns_frontend_selection_shape(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    _mock_law_db_norm_selection_list(httpx_mock)

    response = await api_client.get("/legal-basis/norms")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    expected_norm_count = 2
    assert len(body) == expected_norm_count
    first = body[0]
    assert first["jurabk"] == "BNatSchG"
    assert first["paragraph_nr"] == "44"
    assert first["paragraph_titel"] == "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten"
    assert first["gesetz_titel"] == "Gesetz ueber Naturschutz und Landschaftspflege"
    assert first["gesetz_kurztitel"] == "Bundesnaturschutzgesetz"
    assert first["doknr"] == "BJNR254210009"
    assert first["bundesland"] is None
    assert first["dokument_typ"] == "gesetz"
    assert first["is_deconstructed"] is False
    assert first["deconstruction_id"] is None
    assert first["deconstruction_created_at"] is None
    assert "deconstruction" not in first

    assert first["gesetz"] == {
        "node_type": "gesetz",
        "id": "law-db-gesetz:bund:BNatSchG",
        "name": "Bundesnaturschutzgesetz",
        "jurabk": "BNatSchG",
        "titel": "Gesetz ueber Naturschutz und Landschaftspflege",
        "kurztitel": "Bundesnaturschutzgesetz",
        "doknr": "BJNR254210009",
        "bundesland": None,
        "dokument_typ": "gesetz",
        "fundstelle": "BGBl I (2009, 2542)",
        "standangaben": [],
    }
    assert first["norm"] == {
        "node_type": "norm",
        "id": "law-db-norm:bund:BNatSchG:44",
        "gesetz_id": "law-db-gesetz:bund:BNatSchG",
        "paragraph_nr": "44",
        "paragraph_titel": "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten",
        "text": "Vorschriften fuer besonders geschuetzte Tier- und Pflanzenarten",
        "regelungsgegenstand": None,
        "doknr": "BJNR254210009",
        "prev": None,
        "next": None,
        "frontend_parent_ids": [],
        "is_outdated": False,
    }
    assert body[1]["gesetz"]["jurabk"] == "VwGO"
    assert body[1]["norm"]["paragraph_nr"] == "80"
    assert body[1]["norm"]["text"] == "Aufschiebende Wirkung"
    assert response.headers["x-total-count"] == "2"
    assert response.headers["x-returned-count"] == "2"
    assert response.headers["x-offset"] == "0"
    assert response.headers["x-has-more"] == "false"
    assert not any(request.url.path == "/norms/search" for request in httpx_mock.get_requests())


@pytest.mark.asyncio
async def test_get_legal_basis_norms_paginates_deterministically_without_duplicates(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    documents = [
        {"doknr": "DOK-VWGO", "jurabk": "VwGO", "kurzue": "Verwaltungsgerichtsordnung"},
        {"doknr": "DOK-BNAT", "jurabk": "BNatSchG", "kurzue": "Bundesnaturschutzgesetz"},
        {"doknr": "DOK-AREG", "jurabk": "ARegG", "kurzue": "A-Regelungsgesetz"},
    ]
    toc_entries = [
        {
            "Title": "Aufschiebende Wirkung",
            "Ident": "§ 80",
            "paragraph_nr": "80",
            "paragraph_typ": "§",
            "text": "Aufschiebende Wirkung",
            "doknr": "DOK-VWGO",
            "jurabk": "VwGO",
        },
        {
            "Title": "Artenschutz",
            "Ident": "§ 44",
            "paragraph_nr": "44",
            "paragraph_typ": "§",
            "text": "Artenschutz",
            "doknr": "DOK-BNAT",
            "jurabk": "BNatSchG",
        },
        {
            "Title": "Anwendungsbereich",
            "Ident": "§ 1",
            "paragraph_nr": "1",
            "paragraph_typ": "§",
            "text": "Anwendungsbereich",
            "doknr": "DOK-AREG",
            "jurabk": "ARegG",
        },
    ]
    _mock_law_db_norm_selection_entries(httpx_mock, documents=documents, toc_entries=toc_entries)
    _mock_law_db_norm_selection_entries(httpx_mock, documents=documents, toc_entries=toc_entries)

    first_page = await api_client.get("/legal-basis/norms", params={"limit": 2})
    second_page = await api_client.get("/legal-basis/norms", params={"limit": 2, "offset": 2})

    assert first_page.status_code == HTTPStatus.OK
    assert second_page.status_code == HTTPStatus.OK
    first_body = first_page.json()
    second_body = second_page.json()
    assert first_page.headers["x-total-count"] == "3"
    assert first_page.headers["x-returned-count"] == "2"
    assert first_page.headers["x-offset"] == "0"
    assert first_page.headers["x-limit"] == "2"
    assert first_page.headers["x-has-more"] == "true"
    assert first_page.headers["x-next-offset"] == "2"
    assert second_page.headers["x-total-count"] == "3"
    assert second_page.headers["x-returned-count"] == "1"
    assert second_page.headers["x-offset"] == "2"
    assert second_page.headers["x-has-more"] == "false"
    assert [item["jurabk"] for item in first_body] == ["ARegG", "BNatSchG"]
    assert [item["jurabk"] for item in second_body] == ["VwGO"]

    first_page_ids = {item["norm"]["id"] for item in first_body}
    second_page_ids = {item["norm"]["id"] for item in second_body}
    assert first_page_ids.isdisjoint(second_page_ids)


@pytest.mark.asyncio
async def test_get_legal_basis_norms_high_limit_uses_metadata_only_deconstruction_lookup(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    _db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    deconstruction_id = uuid4()
    async with _db_session_factory() as session:
        session.add(
            NormDeconstruction(
                id=deconstruction_id,
                jurabk="TestLaw",
                paragraph="1199",
                deconstruction={"large": "payload"},
                created_at=datetime(2026, 6, 22, tzinfo=UTC),
            )
        )
        await session.commit()

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    total_norms = 1_200
    _mock_law_db_norm_selection_entries(
        httpx_mock,
        documents=[{"doknr": "DOK-TEST", "jurabk": "TestLaw", "kurzue": "Test Law"}],
        toc_entries=[
            {
                "Title": f"Paragraph {index}",
                "Ident": f"§ {index}",
                "paragraph_nr": str(index),
                "paragraph_typ": "§",
                "text": f"Paragraph {index}",
                "doknr": "DOK-TEST",
                "jurabk": "TestLaw",
            }
            for index in range(total_norms)
        ],
    )

    response = await api_client.get("/legal-basis/norms", params={"limit": 30_000})

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert len(body) == total_norms
    assert response.headers["x-total-count"] == str(total_norms)
    assert response.headers["x-returned-count"] == str(total_norms)
    assert response.headers["x-limit"] == "30000"
    assert response.headers["x-has-more"] == "false"
    deconstructed = next(item for item in body if item["paragraph_nr"] == "1199")
    assert deconstructed["is_deconstructed"] is True
    assert deconstructed["deconstruction_id"] == str(deconstruction_id)
    assert "deconstruction" not in deconstructed
    assert "deconstruction" not in deconstructed["norm"]


@pytest.mark.asyncio
async def test_add_legal_basis_norms_materializes_multiple_project_nodes(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_law_db_norm(httpx_mock)
    _mock_law_db_norm(
        httpx_mock,
        paragraph_nr="45",
        title="Ausnahmen",
        paragraph_text="Second norm text",
    )

    project_id = uuid4()
    topic_id = uuid4()
    topic_norm_id = uuid4()
    second_topic_norm_id = uuid4()
    _mock_project_logic_add_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=topic_norm_id,
    )
    _mock_project_logic_add_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=second_topic_norm_id,
        paragraph_nr="45",
        include_topic_lookup=False,
    )
    response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={
            "topic_id": str(topic_id),
            "norms": [
                {"jurabk": "BNatSchG", "paragraph_nr": "§ 44"},
                {"jurabk": "BNatSchG", "paragraph_nr": "45"},
            ],
        },
    )

    assert response.status_code == HTTPStatus.OK
    payload = response.json()
    assert set(payload) == {"items"}
    assert [item["norm"]["paragraph_nr"] for item in payload["items"]] == ["44", "45"]

    first = payload["items"][0]
    _assert_created_bnat_schg_44_item(
        first,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=topic_norm_id,
    )

    second = payload["items"][1]
    assert second["created_gesetz"] is False
    assert second["created_norm"] is True
    assert second["created_topic_norm"] is True
    assert second["gesetz"]["id"] == first["gesetz"]["id"]
    assert second["norm"]["paragraph_nr"] == "45"
    assert second["norm"]["paragraph_titel"] == "Ausnahmen"
    assert second["norm"]["text"] == "Second norm text"
    assert second["topic_norm"]["id"] == str(second_topic_norm_id)
    assert second["norm"]["frontend_parent_ids"] == [f"topic_norm:{second_topic_norm_id}"]


@pytest.mark.asyncio
async def test_add_legal_basis_norm_rejects_extra_selection_fields(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
) -> None:
    response = await api_client.post(
        f"/legal-basis/projects/{uuid4()}/norms",
        params={"project_version": 1},
        json={
            "topic_id": str(uuid4()),
            "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44", "absatz": "1"}],
        },
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["detail"][0]["type"] == "extra_forbidden"
    assert response.json()["detail"][0]["loc"] == ["body", "norms", 0, "absatz"]
    assert httpx_mock.get_requests() == []


@pytest.mark.asyncio
async def test_add_legal_basis_norms_reuses_existing_nodes_idempotently(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_law_db_norm(httpx_mock)
    _mock_law_db_norm(httpx_mock)

    project_id = uuid4()
    topic_id = uuid4()
    topic_norm_id = uuid4()
    _mock_project_logic_add_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=topic_norm_id,
    )
    _mock_project_logic_existing_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=topic_norm_id,
        topic_norm_summary_includes_id=False,
    )
    first_response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={"topic_id": str(topic_id), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "§ 44"}]},
    )

    assert first_response.status_code == HTTPStatus.OK
    first = first_response.json()["items"][0]

    second_response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={"topic_id": str(topic_id), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44"}]},
    )

    assert second_response.status_code == HTTPStatus.OK
    second = second_response.json()["items"][0]
    assert second["created_gesetz"] is False
    assert second["created_norm"] is False
    assert second["created_topic_norm"] is False
    assert second["gesetz"]["id"] == first["gesetz"]["id"]
    assert second["norm"]["id"] == first["norm"]["id"]
    assert second["topic_norm"]["id"] == str(topic_norm_id)
    assert second["norm"]["frontend_parent_ids"] == [f"topic_norm:{topic_norm_id}"]


@pytest.mark.asyncio
async def test_add_legal_basis_norm_recreates_topic_norm_after_frontend_delete(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_law_db_norm(httpx_mock)
    _mock_law_db_norm(httpx_mock)

    project_id = uuid4()
    topic_id = uuid4()
    deleted_topic_norm_id = uuid4()
    recreated_topic_norm_id = uuid4()
    _mock_project_logic_add_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=deleted_topic_norm_id,
    )
    _mock_project_logic_add_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=recreated_topic_norm_id,
    )

    first_response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={"topic_id": str(topic_id), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44"}]},
    )

    assert first_response.status_code == HTTPStatus.OK
    assert first_response.json()["items"][0]["topic_norm"]["id"] == str(deleted_topic_norm_id)

    second_response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={"topic_id": str(topic_id), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44"}]},
    )

    assert second_response.status_code == HTTPStatus.OK
    second = second_response.json()["items"][0]
    assert second["created_gesetz"] is False
    assert second["created_norm"] is False
    assert second["created_topic_norm"] is True
    assert second["topic_norm"]["id"] == str(recreated_topic_norm_id)
    assert second["norm"]["frontend_parent_ids"] == [
        f"topic_norm:{deleted_topic_norm_id}",
        f"topic_norm:{recreated_topic_norm_id}",
    ]


@pytest.mark.asyncio
async def test_add_legal_basis_norm_returns_deconstruction_metadata_without_payload(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    _db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    deconstruction_id = uuid4()
    async with _db_session_factory() as session:
        session.add(
            NormDeconstruction(
                id=deconstruction_id,
                jurabk="BNatSchG",
                paragraph="§ 44",
                deconstruction={"large": "payload"},
                created_at=datetime(2026, 6, 22, tzinfo=UTC),
            )
        )
        await session.commit()

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_law_db_norm(httpx_mock)

    project_id = uuid4()
    topic_id = uuid4()
    topic_norm_id = uuid4()
    _mock_project_logic_add_topic_norm(
        httpx_mock,
        project_id=project_id,
        topic_id=topic_id,
        topic_norm_id=topic_norm_id,
    )

    response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={"topic_id": str(topic_id), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44"}]},
    )

    assert response.status_code == HTTPStatus.OK
    payload = response.json()["items"][0]
    assert payload["is_deconstructed"] is True
    assert payload["deconstruction_id"] == str(deconstruction_id)
    assert "deconstruction" not in payload
    assert "deconstruction" not in payload["norm"]


@pytest.mark.asyncio
async def test_add_legal_basis_norm_rejects_topic_from_another_project(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_law_db_norm(httpx_mock)

    project_id = uuid4()
    topic_id = uuid4()
    _mock_project_logic_topic_from_other_project(
        httpx_mock,
        project_id=uuid4(),
        topic_id=topic_id,
    )

    response = await api_client.post(
        f"/legal-basis/projects/{project_id}/norms",
        params={"project_version": 1},
        json={"topic_id": str(topic_id), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44"}]},
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["detail"] == "Topic does not belong to this project."
    assert not any(
        request.method == "POST" and request.url.host == "project-logic" for request in httpx_mock.get_requests()
    )


@pytest.mark.asyncio
async def test_add_legal_basis_norm_rejects_norm_without_text_before_project_logic_write(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_law_db_norm(httpx_mock)
    _mock_law_db_norm(httpx_mock, paragraph_nr="45", paragraph_text=None)

    response = await api_client.post(
        f"/legal-basis/projects/{uuid4()}/norms",
        params={"project_version": 1},
        json={
            "topic_id": str(uuid4()),
            "norms": [
                {"jurabk": "BNatSchG", "paragraph_nr": "44"},
                {"jurabk": "BNatSchG", "paragraph_nr": "45"},
            ],
        },
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["detail"] == "Law database norm has no text and cannot be added to the project."
    assert not any(request.url.host == "project-logic" for request in httpx_mock.get_requests())


@pytest.mark.asyncio
async def test_add_legal_basis_norm_rejects_ambiguous_law_db_match_before_project_logic_write(
    api_client: httpx.AsyncClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def validate_write_version(_project_id: object, project_version: int) -> int:
        return project_version

    monkeypatch.setattr(settings, "LAW_DATABASE_BASE_URL", "http://law-db")
    monkeypatch.setattr(settings, "PROJECT_LOGIC_SERVICE_URL", "http://project-logic")
    monkeypatch.setattr(legal_basis_routes, "validate_project_write_version", validate_write_version)
    _mock_ambiguous_law_db_norms(httpx_mock)

    response = await api_client.post(
        f"/legal-basis/projects/{uuid4()}/norms",
        params={"project_version": 1},
        json={"topic_id": str(uuid4()), "norms": [{"jurabk": "BNatSchG", "paragraph_nr": "44"}]},
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["detail"] == "Multiple law database norms matched for the selected jurabk and paragraph_nr."
    assert not any(request.url.host == "project-logic" for request in httpx_mock.get_requests())
