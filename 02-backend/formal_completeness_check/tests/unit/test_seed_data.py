import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from src.models.db_models import Base
from src.scripts import seed_data


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def test_seed_template_data_scopes_categories_by_project_type(monkeypatch: pytest.MonkeyPatch) -> None:
    project_type_a = uuid.uuid4()
    project_type_b = uuid.uuid4()
    monkeypatch.setattr(
        seed_data,
        "TEMPLATE_SEED_DATA",
        [
            {
                "category": "Shared Category",
                "project_type_id": project_type_a,
                "document_types": [
                    {"name": "Shared Doc", "description": "A"},
                ],
            },
            {
                "category": "Shared Category",
                "project_type_id": project_type_b,
                "document_types": [
                    {"name": "Shared Doc", "description": "B"},
                ],
            },
        ],
    )

    with _session() as session:
        category_ids = seed_data.seed_template_categories(session)
        seed_data.seed_template_document_types(session, category_ids)
        session.commit()

        category_count = session.execute(text("SELECT COUNT(*) FROM template_category")).scalar_one()
        doc_type_count = session.execute(text("SELECT COUNT(*) FROM template_document_type")).scalar_one()
        project_type_count = session.execute(
            text(
                """
                SELECT COUNT(DISTINCT project_type_id)
                FROM template_category
                WHERE name = 'Shared Category'
                """
            )
        ).scalar_one()

    assert category_count == 2
    assert doc_type_count == 2
    assert project_type_count == 2
    assert category_ids[(project_type_a, "Shared Category")] != category_ids[(project_type_b, "Shared Category")]


def test_seed_template_document_types_scopes_duplicates_by_category(monkeypatch: pytest.MonkeyPatch) -> None:
    project_type_id = uuid.uuid4()
    monkeypatch.setattr(
        seed_data,
        "TEMPLATE_SEED_DATA",
        [
            {
                "category": "Category A",
                "project_type_id": project_type_id,
                "document_types": [
                    {"name": "Shared Doc", "description": "A"},
                ],
            },
            {
                "category": "Category B",
                "project_type_id": project_type_id,
                "document_types": [
                    {"name": "Shared Doc", "description": "B"},
                ],
            },
        ],
    )

    with _session() as session:
        seed_data.seed_template_document_types(session, seed_data.seed_template_categories(session))
        session.commit()

        category_count = session.execute(text("SELECT COUNT(*) FROM template_category")).scalar_one()
        doc_type_rows = session.execute(
            text(
                """
                SELECT tc.name
                FROM template_document_type tdt
                JOIN template_category tc ON tc.id = tdt.template_category_id
                WHERE tdt.name = 'Shared Doc'
                ORDER BY tc.name
                """
            )
        ).fetchall()

    assert category_count == 2
    assert len(doc_type_rows) == 2
    assert [row[0] for row in doc_type_rows] == ["Category A", "Category B"]
