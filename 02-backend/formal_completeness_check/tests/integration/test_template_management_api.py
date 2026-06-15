"""Integration tests for template CRUD API endpoints."""

import uuid
from http import HTTPStatus
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.models.db_models import TemplateCategory, TemplateDocumentType

PROJECT_TYPE_ID = uuid.uuid4()


async def _seed_category(
    session_factory: async_sessionmaker[AsyncSession],
    project_type_id: uuid.UUID = PROJECT_TYPE_ID,
    category_name: str = "Test Category",
    doc_types: list[dict[str, Any]] | None = None,
) -> uuid.UUID:
    """Seed a template category with optional document types. Returns category id."""
    async with session_factory() as session:
        category = TemplateCategory(
            name=category_name,
            project_type_id=project_type_id,
        )
        session.add(category)
        await session.flush()

        for dt in doc_types or []:
            doc_type = TemplateDocumentType(
                template_category_id=category.id,
                name=dt["name"],
                description=dt.get("description", ""),
                expected_count=dt.get("expected_count"),
            )
            session.add(doc_type)

        await session.commit()
        return category.id


@pytest.mark.asyncio
async def test_get_template_categories_empty(client: AsyncClient) -> None:
    """GET returns empty list for project type with no data."""
    response = await client.get(f"/{uuid.uuid4()}/template-categories")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_template_categories_with_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """GET returns categories with nested document types."""
    pt_id = uuid.uuid4()
    await _seed_category(
        session_factory,
        project_type_id=pt_id,
        category_name="Allgemeiner Teil",
        doc_types=[
            {"name": "Erläuterungsbericht", "description": "Desc", "expected_count": 1},
            {"name": "Übersichtskarte", "description": "Desc2"},
        ],
    )

    response = await client.get(f"/{pt_id}/template-categories")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Allgemeiner Teil"
    assert data[0]["project_type_id"] == str(pt_id)
    assert len(data[0]["template_document_types"]) == 2


@pytest.mark.asyncio
async def test_get_excludes_deleted(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """GET filters out soft-deleted categories and document types."""
    pt_id = uuid.uuid4()
    cat_id = await _seed_category(
        session_factory,
        project_type_id=pt_id,
        category_name="Visible",
        doc_types=[{"name": "Visible Doc", "description": "d"}],
    )

    # Seed a deleted category
    async with session_factory() as session:
        deleted_cat = TemplateCategory(
            name="Deleted Category",
            project_type_id=pt_id,
            deleted=True,
        )
        session.add(deleted_cat)
        await session.commit()

    # Seed a deleted doc type in the visible category
    async with session_factory() as session:
        deleted_dt = TemplateDocumentType(
            template_category_id=cat_id,
            name="Deleted Doc",
            description="d",
            deleted=True,
        )
        session.add(deleted_dt)
        await session.commit()

    response = await client.get(f"/{pt_id}/template-categories")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Visible"
    assert len(data[0]["template_document_types"]) == 1
    assert data[0]["template_document_types"][0]["name"] == "Visible Doc"


@pytest.mark.asyncio
async def test_create_template_categories(client: AsyncClient) -> None:
    """POST creates categories with nested document types."""
    pt_id = uuid.uuid4()

    response = await client.post(
        f"/{pt_id}/template-categories",
        json=[
            {
                "name": "Category A",
                "document_types": [
                    {
                        "name": "Doc Type 1",
                        "description": "Description 1",
                        "expected_count": 2,
                    },
                    {
                        "name": "Doc Type 2",
                        "description": "Description 2",
                    },
                ],
            },
            {
                "name": "Category B",
                "document_types": [],
            },
        ],
    )

    assert response.status_code == HTTPStatus.CREATED
    data = response.json()
    assert len(data) == 2

    names = {cat["name"] for cat in data}
    assert names == {"Category A", "Category B"}

    cat_a = next(c for c in data if c["name"] == "Category A")
    assert len(cat_a["template_document_types"]) == 2
    assert cat_a["project_type_id"] == str(pt_id)

    cat_b = next(c for c in data if c["name"] == "Category B")
    assert len(cat_b["template_document_types"]) == 0


@pytest.mark.asyncio
async def test_create_template_categories_duplicate_name_returns_conflict(
    client: AsyncClient,
) -> None:
    """POST returns 409 for duplicate active category names in one project type."""
    pt_id = uuid.uuid4()
    payload = [
        {
            "name": "Category A",
            "document_types": [
                {
                    "name": "Doc Type 1",
                    "description": "Description 1",
                }
            ],
        }
    ]

    first_response = await client.post(f"/{pt_id}/template-categories", json=payload)
    second_response = await client.post(f"/{pt_id}/template-categories", json=payload)

    assert first_response.status_code == HTTPStatus.CREATED
    assert second_response.status_code == HTTPStatus.CONFLICT


@pytest.mark.asyncio
async def test_create_template_categories_allows_same_name_for_other_project_type(
    client: AsyncClient,
) -> None:
    """POST allows the same names for different project types."""
    payload = [
        {
            "name": "Category A",
            "document_types": [
                {
                    "name": "Doc Type 1",
                    "description": "Description 1",
                }
            ],
        }
    ]

    first_response = await client.post(
        f"/{uuid.uuid4()}/template-categories",
        json=payload,
    )
    second_response = await client.post(
        f"/{uuid.uuid4()}/template-categories",
        json=payload,
    )

    assert first_response.status_code == HTTPStatus.CREATED
    assert second_response.status_code == HTTPStatus.CREATED


@pytest.mark.asyncio
async def test_create_template_categories_rejects_oversized_payload(
    client: AsyncClient,
) -> None:
    """POST rejects oversized category lists."""
    response = await client.post(
        f"/{uuid.uuid4()}/template-categories",
        json=[{"name": f"Category {index}", "document_types": []} for index in range(51)],
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_create_empty_list(client: AsyncClient) -> None:
    """POST with empty list returns 201 with empty result."""
    response = await client.post(
        f"/{uuid.uuid4()}/template-categories",
        json=[],
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json() == []


@pytest.mark.asyncio
async def test_delete_all_template_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """DELETE soft-deletes all template data and returns counts."""
    pt_id = uuid.uuid4()
    await _seed_category(
        session_factory,
        project_type_id=pt_id,
        category_name="Cat 1",
        doc_types=[{"name": "DT1", "description": "d"}, {"name": "DT2", "description": "d"}],
    )
    await _seed_category(
        session_factory,
        project_type_id=pt_id,
        category_name="Cat 2",
        doc_types=[{"name": "DT3", "description": "d"}],
    )

    response = await client.delete(f"/{pt_id}/template-categories")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["deleted_categories"] == 2
    assert data["deleted_document_types"] == 3

    # Verify GET returns empty after delete
    get_response = await client.get(f"/{pt_id}/template-categories")
    assert get_response.status_code == HTTPStatus.OK
    assert get_response.json() == []


@pytest.mark.asyncio
async def test_delete_no_data(client: AsyncClient) -> None:
    """DELETE with no data returns zero counts."""
    response = await client.delete(f"/{uuid.uuid4()}/template-categories")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["deleted_categories"] == 0
    assert data["deleted_document_types"] == 0
