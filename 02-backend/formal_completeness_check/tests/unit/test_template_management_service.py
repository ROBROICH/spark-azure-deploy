"""Unit tests for template_management_service."""

import uuid
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import TemplateCategory, TemplateDocumentType
from src.models.schemas.template_management_schemas import (
    CreateTemplateCategoryRequest,
    CreateTemplateDocumentTypeRequest,
)
from src.services.template_management_service import (
    create_template_categories,
    get_template_categories,
    soft_delete_all_templates,
)

PROJECT_TYPE_ID = uuid.uuid4()


async def _seed(
    db: AsyncSession,
    project_type_id: uuid.UUID = PROJECT_TYPE_ID,
    category_name: str = "Test Category",
    doc_types: list[dict[str, Any]] | None = None,
) -> TemplateCategory:
    """Seed a template category with optional document types."""
    category = TemplateCategory(
        name=category_name,
        project_type_id=project_type_id,
    )
    db.add(category)
    await db.flush()

    for dt in doc_types or []:
        doc_type = TemplateDocumentType(
            template_category_id=category.id,
            name=dt["name"],
            description=dt.get("description", ""),
            expected_count=dt.get("expected_count"),
        )
        db.add(doc_type)

    await db.flush()
    await db.commit()
    return category


@pytest.mark.asyncio
async def test_get_template_categories_empty(db_session: AsyncSession) -> None:
    """Returns empty list when no data exists."""
    result = await get_template_categories(uuid.uuid4(), db_session)
    assert result == []


@pytest.mark.asyncio
async def test_get_template_categories_with_data(db_session: AsyncSession) -> None:
    """Returns categories with nested document types."""
    pt_id = uuid.uuid4()
    await _seed(
        db_session,
        project_type_id=pt_id,
        category_name="Cat A",
        doc_types=[{"name": "DT1", "description": "d"}],
    )

    result = await get_template_categories(pt_id, db_session)

    assert len(result) == 1
    assert result[0].name == "Cat A"
    assert len(result[0].template_document_types) == 1
    assert result[0].template_document_types[0].name == "DT1"


@pytest.mark.asyncio
async def test_get_excludes_deleted(db_session: AsyncSession) -> None:
    """Excludes soft-deleted categories and document types."""
    pt_id = uuid.uuid4()
    cat = await _seed(
        db_session,
        project_type_id=pt_id,
        category_name="Visible",
        doc_types=[{"name": "Visible DT", "description": "d"}],
    )

    # Add a deleted category
    deleted_cat = TemplateCategory(name="Deleted", project_type_id=pt_id, deleted=True)
    db_session.add(deleted_cat)

    # Add a deleted doc type to the visible category
    deleted_dt = TemplateDocumentType(
        template_category_id=cat.id,
        name="Deleted DT",
        description="d",
        deleted=True,
    )
    db_session.add(deleted_dt)
    await db_session.commit()

    result = await get_template_categories(pt_id, db_session)

    assert len(result) == 1
    assert result[0].name == "Visible"
    assert len(result[0].template_document_types) == 1
    assert result[0].template_document_types[0].name == "Visible DT"


@pytest.mark.asyncio
async def test_create_template_categories(db_session: AsyncSession) -> None:
    """Creates categories with nested document types."""
    pt_id = uuid.uuid4()
    payloads = [
        CreateTemplateCategoryRequest(
            category="Cat A",
            document_types=[
                CreateTemplateDocumentTypeRequest(name="DT1", description="Desc 1", expected_count=2),
            ],
        ),
        CreateTemplateCategoryRequest(category="Cat B", document_types=[]),
    ]

    result = await create_template_categories(pt_id, payloads, db_session)

    assert len(result) == 2
    names = {r.name for r in result}
    assert names == {"Cat A", "Cat B"}

    cat_a = next(r for r in result if r.name == "Cat A")
    assert len(cat_a.template_document_types) == 1
    assert cat_a.template_document_types[0].expected_count == 2
    assert cat_a.project_type_id == pt_id


@pytest.mark.asyncio
async def test_create_template_categories_allows_same_name_for_other_project_type(
    db_session: AsyncSession,
) -> None:
    """Allows the same category and document type names for other project types."""
    shared_payload = [
        CreateTemplateCategoryRequest(
            category="Shared Category",
            document_types=[
                CreateTemplateDocumentTypeRequest(
                    name="Shared Doc",
                    description="Desc 1",
                    expected_count=1,
                ),
            ],
        ),
    ]

    result_a = await create_template_categories(uuid.uuid4(), shared_payload, db_session)
    result_b = await create_template_categories(uuid.uuid4(), shared_payload, db_session)

    assert result_a[0].name == "Shared Category"
    assert result_b[0].name == "Shared Category"
    assert result_a[0].template_document_types[0].name == "Shared Doc"
    assert result_b[0].template_document_types[0].name == "Shared Doc"


@pytest.mark.asyncio
async def test_soft_delete_all(db_session: AsyncSession) -> None:
    """Soft-deletes all categories and their document types."""
    pt_id = uuid.uuid4()
    await _seed(
        db_session,
        project_type_id=pt_id,
        category_name="Cat 1",
        doc_types=[{"name": "DT1", "description": "d"}, {"name": "DT2", "description": "d"}],
    )
    await _seed(
        db_session,
        project_type_id=pt_id,
        category_name="Cat 2",
        doc_types=[{"name": "DT3", "description": "d"}],
    )

    result = await soft_delete_all_templates(pt_id, db_session)

    assert result.deleted_categories == 2
    assert result.deleted_document_types == 3

    # Verify they no longer appear in queries
    categories = await get_template_categories(pt_id, db_session)
    assert categories == []


@pytest.mark.asyncio
async def test_soft_delete_all_ignores_already_deleted_doc_types(
    db_session: AsyncSession,
) -> None:
    """Counts only active document types when soft-deleting a category."""
    pt_id = uuid.uuid4()
    category = await _seed(
        db_session,
        project_type_id=pt_id,
        category_name="Cat 1",
        doc_types=[{"name": "Active DT", "description": "d"}],
    )

    deleted_dt = TemplateDocumentType(
        template_category_id=category.id,
        name="Deleted DT",
        description="d",
        deleted=True,
    )
    db_session.add(deleted_dt)
    await db_session.commit()

    result = await soft_delete_all_templates(pt_id, db_session)

    assert result.deleted_categories == 1
    assert result.deleted_document_types == 1


@pytest.mark.asyncio
async def test_soft_delete_no_data(db_session: AsyncSession) -> None:
    """Returns zero counts when no data exists."""
    result = await soft_delete_all_templates(uuid.uuid4(), db_session)

    assert result.deleted_categories == 0
    assert result.deleted_document_types == 0
