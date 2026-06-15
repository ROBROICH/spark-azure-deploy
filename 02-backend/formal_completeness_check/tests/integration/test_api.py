"""Integration tests for API endpoints."""

import uuid
from collections.abc import Iterator
from http import HTTPStatus
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.models.db_models import (
    Category,
    Document,
    DocumentType,
    ProjectTemplateVersion,
    TemplateCategory,
    TemplateDocumentType,
)
from src.models.schemas.fcs_types import (
    AssignedDocument,
    DocumentTypeDefinition,
    FormalCompletenessCheckResults,
    MatchedDocumentTypeOutput,
    UnassignedDocument,
)


@pytest.fixture(autouse=True)
def _mock_project_services(monkeypatch: pytest.MonkeyPatch) -> Iterator[AsyncMock]:
    async def latest(project_id: uuid.UUID) -> int:
        return 1

    async def validate(project_id: uuid.UUID, project_version: int) -> int:
        return project_version

    monkeypatch.setattr("src.services.fcs_service._get_latest_project_version", latest)
    monkeypatch.setattr("src.services.fcs_service._validate_project_write_version", validate)
    with patch("src.services.job_service.verify_file_project_binding", new=AsyncMock(return_value=1)) as mock:
        yield mock


@pytest.mark.asyncio
async def test_get_documents_empty_project(client: AsyncClient) -> None:
    """Verifies API returns empty results correctly."""
    project_id = uuid.uuid4()

    response = await client.get(f"/{project_id}")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["matched_document_types"] == []
    assert data["unassigned_documents"] == []


@pytest.mark.asyncio
async def test_get_documents_with_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies full API -> service -> DB -> response flow."""
    project_id = uuid.uuid4()

    async with session_factory() as session:
        cat = Category(project_id=project_id, name="Environmental")
        session.add(cat)
        await session.flush()

        doc_type = DocumentType(
            project_id=project_id,
            category_id=cat.id,
            name="Impact Assessment",
            description="Environmental impact assessment document",
            confidence=0.92,
        )
        session.add(doc_type)
        await session.flush()

        document = Document(
            project_id=project_id,
            file_id=uuid.uuid4(),
            ai_suggested_required_document_type_id=doc_type.id,
            document_name="impact_assessment.pdf",
            reasoning="Matches environmental criteria",
            confidence=0.95,
        )
        session.add(document)
        await session.commit()

    response = await client.get(f"/{project_id}")

    assert response.status_code == HTTPStatus.OK
    data = response.json()

    assert len(data["matched_document_types"]) == 1
    matched = data["matched_document_types"][0]
    assert matched["required_document_type"]["category"] == "Environmental"
    assert matched["required_document_type"]["document_type_name"] == "Impact Assessment"
    assert matched["confidence"] == 0.92
    assert len(matched["assigned_documents"]) == 1
    assert matched["assigned_documents"][0]["document_name"] == "impact_assessment.pdf"
    assert matched["assigned_documents"][0]["confidence"] == 0.95


@pytest.mark.asyncio
async def test_get_required_documents_empty_project(client: AsyncClient) -> None:
    """Verifies API returns empty list for project with no categories."""
    project_id = uuid.uuid4()

    response = await client.get(f"/{project_id}/required-document-types")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"categories": []}


@pytest.mark.asyncio
async def test_get_required_documents_with_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies required-documents endpoint returns categories with document types."""
    project_id = uuid.uuid4()

    async with session_factory() as session:
        cat = Category(project_id=project_id, name="Environmental")
        session.add(cat)
        await session.flush()

        doc_type = DocumentType(
            project_id=project_id,
            category_id=cat.id,
            name="Impact Assessment",
            description="Environmental impact assessment document",
            confidence=0.92,
        )
        session.add(doc_type)
        await session.flush()

        cat_id = str(cat.id)
        doc_type_id = str(doc_type.id)
        await session.commit()

    response = await client.get(f"/{project_id}/required-document-types")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    categories = data["categories"]

    assert len(categories) == 1
    assert categories[0]["category_id"] == cat_id
    assert categories[0]["category_name"] == "Environmental"
    assert len(categories[0]["required_documents"]) == 1
    assert categories[0]["required_documents"][0]["document_type_id"] == doc_type_id
    assert categories[0]["required_documents"][0]["document_name"] == "Impact Assessment"
    assert categories[0]["required_documents"][0]["origin"] == "system"
    assert categories[0]["required_documents"][0]["is_resolved"] is False


@pytest.mark.asyncio
async def test_get_required_documents_with_assigned_documents(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies required-documents endpoint includes assigned documents with document_id and is_resolved."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    async with session_factory() as session:
        cat = Category(project_id=project_id, name="Environmental")
        session.add(cat)
        await session.flush()

        doc_type = DocumentType(
            project_id=project_id,
            category_id=cat.id,
            name="Impact Assessment",
            description="Environmental impact assessment document",
            confidence=0.92,
        )
        session.add(doc_type)
        await session.flush()

        document = Document(
            project_id=project_id,
            file_id=file_id,
            ai_suggested_required_document_type_id=doc_type.id,
            document_name="impact_assessment.pdf",
            reasoning="Matches environmental criteria",
            confidence=0.95,
        )
        session.add(document)
        await session.commit()

    response = await client.get(f"/{project_id}/required-document-types")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    categories = data["categories"]

    assert len(categories) == 1
    required_docs = categories[0]["required_documents"]
    assert len(required_docs) == 1
    # is_resolved is now on the document type itself, not on assigned documents
    assert required_docs[0]["origin"] == "system"
    assert required_docs[0]["is_resolved"] is False


@pytest.mark.asyncio
async def test_reassign_document_type_assignment(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies assigned document can be reassigned via API."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    async with session_factory() as session:
        cat = Category(project_id=project_id, name="Category")
        session.add(cat)
        await session.flush()

        old_doc_type = DocumentType(
            project_id=project_id,
            category_id=cat.id,
            name="Old Type",
            description="Old description",
        )
        new_doc_type = DocumentType(
            project_id=project_id,
            category_id=cat.id,
            name="New Type",
            description="New description",
        )
        session.add_all([old_doc_type, new_doc_type])
        await session.flush()
        new_doc_type_id = new_doc_type.id

        doc = Document(
            project_id=project_id,
            file_id=file_id,
            ai_suggested_required_document_type_id=old_doc_type.id,
            document_name="doc.pdf",
            reasoning="Initial assignment",
            confidence=0.5,
        )
        session.add(doc)
        await session.flush()
        doc_id = doc.id
        await session.commit()

    response = await client.patch(
        f"/{project_id}/documents/{file_id}",
        json={
            "human_required_document_type_id": str(new_doc_type_id),
        },
    )
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["file_id"] == str(file_id)
    assert data["human_required_document_type_id"] == str(new_doc_type_id)

    async with session_factory() as session:
        doc = (await session.execute(select(Document).where(Document.id == doc_id))).scalar_one()
        assert doc.human_required_document_type_id == new_doc_type_id


@pytest.mark.asyncio
async def test_job_done_stores_results(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies results endpoint fetches, stores data, and returns success."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()
    doc_file_id = uuid.uuid4()
    unassigned_id_1 = uuid.uuid4()
    unassigned_id_2 = uuid.uuid4()

    mock_results = FormalCompletenessCheckResults(
        matched_document_types=[
            MatchedDocumentTypeOutput(
                required_document_type=DocumentTypeDefinition(
                    category="Test Category",
                    document_type_name="Test Document",
                    document_type_description="Test description",
                ),
                assigned_documents=[
                    AssignedDocument(
                        document_id=doc_file_id,
                        document_name="test.pdf",
                        reasoning="Test reasoning",
                        confidence=0.85,
                    )
                ],
                confidence=0.90,
            )
        ],
        unassigned_documents=[
            UnassignedDocument(
                document_id=unassigned_id_1,
                document_name="unknown.pdf",
                reasoning="No matching type",
                confidence=0.92,
            ),
            UnassignedDocument(
                document_id=unassigned_id_2,
                document_name="mystery.doc",
                reasoning="Does not fit categories",
                confidence=0.87,
            ),
        ],
    )

    with patch(
        "src.services.job_service.fetch_results_file",
        new=AsyncMock(return_value=mock_results),
    ):
        response = await client.post(
            f"/{project_id}/results",
            json={"file_id": str(file_id)},
        )

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["status"] == "results_processed"
    assert data["matched_document_types"] == 1
    assert data["assigned_documents"] == 1
    assert data["unassigned_documents"] == 2
    assert data["previous_records_deleted"] == 0

    async with session_factory() as session:
        doc_types = (await session.execute(select(DocumentType))).scalars().all()
        documents = (await session.execute(select(Document))).scalars().all()

        assert len(doc_types) == 1
        assert doc_types[0].name == "Test Document"
        assert doc_types[0].project_id == project_id
        assert doc_types[0].confidence == 0.90

        assert len(documents) == 3  # 1 assigned + 2 unassigned
        assigned_docs = [d for d in documents if d.ai_suggested_required_document_type_id is not None]
        unassigned_docs = [d for d in documents if d.ai_suggested_required_document_type_id is None]

        assert len(assigned_docs) == 1
        assert assigned_docs[0].document_name == "test.pdf"
        assert assigned_docs[0].file_id == doc_file_id
        assert assigned_docs[0].confidence == 0.85

        assert len(unassigned_docs) == 2
        unassigned_names = {d.document_name for d in unassigned_docs}
        assert unassigned_names == {"unknown.pdf", "mystery.doc"}


@pytest.mark.asyncio
async def test_job_done_replaces_candidate_file_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies results endpoint replaces rows for files included in the result."""
    project_id = uuid.uuid4()
    result_file_id = uuid.uuid4()
    candidate_file_id = uuid.uuid4()

    async with session_factory() as session:
        old_cat = Category(project_id=project_id, name="Old Category")
        session.add(old_cat)
        await session.flush()

        old_doc_type = DocumentType(
            project_id=project_id,
            category_id=old_cat.id,
            name="Old Document",
            description="Old description",
        )
        session.add(old_doc_type)
        await session.flush()
        session.add(
            Document(
                project_id=project_id,
                file_id=candidate_file_id,
                ai_suggested_required_document_type_id=old_doc_type.id,
                document_name="old.pdf",
            )
        )
        await session.commit()

    mock_results = FormalCompletenessCheckResults(
        matched_document_types=[
            MatchedDocumentTypeOutput(
                required_document_type=DocumentTypeDefinition(
                    category="New Category",
                    document_type_name="New Document",
                    document_type_description="New description",
                ),
                assigned_documents=[
                    AssignedDocument(
                        document_id=candidate_file_id,
                        document_name="new.pdf",
                        reasoning="new candidate result",
                        confidence=0.88,
                    )
                ],
                confidence=0.88,
            )
        ],
        unassigned_documents=[],
    )

    with patch(
        "src.services.job_service.fetch_results_file",
        new=AsyncMock(return_value=mock_results),
    ):
        response = await client.post(
            f"/{project_id}/results",
            json={"file_id": str(result_file_id)},
        )

    assert response.status_code == HTTPStatus.OK

    async with session_factory() as session:
        doc_types = (await session.execute(select(DocumentType))).scalars().all()
        assert {doc_type.name for doc_type in doc_types} == {"Old Document", "New Document"}
        new_doc_type = next(doc_type for doc_type in doc_types if doc_type.name == "New Document")
        assert new_doc_type.category_id is not None

        documents = (await session.execute(select(Document))).scalars().all()
        assert len(documents) == 1
        assert documents[0].file_id == candidate_file_id
        assert documents[0].document_name == "new.pdf"
        assert documents[0].ai_suggested_required_document_type_id == new_doc_type.id


@pytest.mark.asyncio
async def test_get_template_document_types_auto_registers_project(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """GET /{project_id}/template-document-types lazily registers project and returns templates."""
    project_id = uuid.uuid4()
    project_type_id = uuid.uuid4()

    async with session_factory() as session:
        cat = TemplateCategory(
            id=uuid.uuid4(),
            name="Template Category",
            project_type_id=project_type_id,
        )
        session.add(cat)
        await session.flush()

        tmpl = TemplateDocumentType(
            id=uuid.uuid4(),
            template_category_id=cat.id,
            name="Template Doc",
            description="A template document",
            expected_count=1,
        )
        session.add(tmpl)
        await session.commit()

    # Ensure no ProjectTemplateVersion exists beforehand
    async with session_factory() as session:
        existing = (
            await session.execute(select(ProjectTemplateVersion).where(ProjectTemplateVersion.project_id == project_id))
        ).scalar_one_or_none()
        assert existing is None

    # Mock the PLS lookup used by the service
    with patch(
        "src.services.fcs_service._fetch_project_type_id",
        new=AsyncMock(return_value=project_type_id),
    ):
        response = await client.get(f"/{project_id}/template-document-types?project_version=2")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["category"] == "Template Category"
    assert data[0]["document_type_name"] == "Template Doc"
    assert data[0]["expected_count"] == 1

    # ProjectTemplateVersion should have been created
    async with session_factory() as session:
        ptv = (
            await session.execute(select(ProjectTemplateVersion).where(ProjectTemplateVersion.project_id == project_id))
        ).scalar_one()
        assert ptv.project_type_id == project_type_id
        assert ptv.project_version == 2


@pytest.mark.asyncio
async def test_initialize_required_document_types_endpoint_seeds_project(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    project_id = uuid.uuid4()
    project_type_id = uuid.uuid4()

    async with session_factory() as session:
        cat = TemplateCategory(
            id=uuid.uuid4(),
            name="Template Category",
            project_type_id=project_type_id,
        )
        session.add(cat)
        await session.flush()
        session.add(
            TemplateDocumentType(
                id=uuid.uuid4(),
                template_category_id=cat.id,
                name="Template Doc",
                description="A template document",
                expected_count=1,
            )
        )
        await session.commit()

    response = await client.post(
        f"/{project_id}/required-document-types/initialize?project_version=2",
        json={"project_type_id": str(project_type_id)},
    )

    assert response.status_code == HTTPStatus.OK

    response = await client.get(f"/{project_id}/required-document-types?project_version=2")
    assert response.status_code == HTTPStatus.OK
    categories = {category["category_name"]: category for category in response.json()["categories"]}

    assert set(categories) == {"Benutzerdefiniert", "Template Category"}
    assert [doc["document_name"] for doc in categories["Template Category"]["required_documents"]] == ["Template Doc"]
    assert categories["Benutzerdefiniert"]["required_documents"] == []
