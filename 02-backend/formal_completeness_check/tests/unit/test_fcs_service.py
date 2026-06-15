import uuid
from unittest.mock import AsyncMock, patch

import pytest
from audit_client import ChangeType
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.exceptions.exceptions import ForbiddenError, NotFoundError
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
    DocumentAssignmentItem,
    DocumentTypeDefinition,
    FormalCompletenessCheckResults,
    MatchedDocumentTypeOutput,
    RequiredDocumentResponse,
    UnassignedDocument,
)
from src.services.fcs_service import (
    CUSTOM_CATEGORY_NAME,
    bulk_insert_results,
    create_custom_document_type,
    delete_all_for_project,
    delete_custom_document_type,
    get_document_assignments,
    get_required_document_types_by_category,
    get_results_for_project,
    get_template_document_types,
    initialize_required_document_types_from_templates,
    patch_document_by_file_id,
    patch_required_document_type,
    replace_results_for_files,
)


@pytest.fixture(autouse=True)
def project_versions(monkeypatch: pytest.MonkeyPatch) -> dict[uuid.UUID, int]:
    versions: dict[uuid.UUID, int] = {}

    async def latest(project_id: uuid.UUID) -> int:
        return versions.get(project_id, 1)

    async def validate(project_id: uuid.UUID, project_version: int) -> int:
        return project_version

    monkeypatch.setattr("src.services.fcs_service._get_latest_project_version", latest)
    monkeypatch.setattr("src.services.fcs_service._validate_project_write_version", validate)
    return versions


@pytest.fixture(autouse=True)
def mock_record_audit_entry(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr("src.services.fcs_service.record_audit_entry", mock)
    return mock


async def _seed_template(
    db: AsyncSession,
    project_type_id: uuid.UUID,
    category_name: str = "Test Category",
    document_type_name: str = "Test Template Doc",
) -> tuple[TemplateCategory, TemplateDocumentType]:
    """Helper: insert a TemplateCategory + one TemplateDocumentType for a project type."""
    cat = TemplateCategory(
        id=uuid.uuid4(),
        name=category_name,
        project_type_id=project_type_id,
    )
    db.add(cat)
    await db.flush()
    doc_type = TemplateDocumentType(
        id=uuid.uuid4(),
        template_category_id=cat.id,
        name=document_type_name,
        description="A test document",
        expected_count=1,
    )
    db.add(doc_type)
    await db.commit()
    return cat, doc_type


def create_test_results(
    num_doc_types: int = 2,
    docs_per_type: int = 1,
) -> FormalCompletenessCheckResults:
    """Helper to create test FormalCompletenessCheckResults."""
    matched = []
    for i in range(num_doc_types):
        assigned = [
            AssignedDocument(
                document_id=uuid.uuid4(),
                document_name=f"doc_{i}_{j}.pdf",
                reasoning=f"Reasoning for doc {j}",
                confidence=0.9 - (j * 0.1),
            )
            for j in range(docs_per_type)
        ]
        matched.append(
            MatchedDocumentTypeOutput(
                required_document_type=DocumentTypeDefinition(
                    category=f"Category {i}",
                    document_type_name=f"Document Type {i}",
                    document_type_description=f"Description for type {i}",
                ),
                assigned_documents=assigned,
                confidence=0.9 - (i * 0.05),
            )
        )
    return FormalCompletenessCheckResults(
        matched_document_types=matched,
        unassigned_documents=[
            UnassignedDocument(
                document_id=uuid.uuid4(),
                document_name="unassigned_1.pdf",
                reasoning="No matching type found",
                confidence=0.95,
            ),
            UnassignedDocument(
                document_id=uuid.uuid4(),
                document_name="unassigned_2.pdf",
                reasoning="Does not fit any category",
                confidence=0.88,
            ),
        ],
    )


@pytest.mark.asyncio
async def test_bulk_insert_results(db_session: AsyncSession) -> None:
    """Verifies data is correctly transformed from schema to DB models."""
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=2, docs_per_type=2)

    await bulk_insert_results(project_id, results, db_session)
    await db_session.commit()

    doc_types = (
        (await db_session.execute(select(DocumentType).options(selectinload(DocumentType.category)))).scalars().all()
    )
    documents = (await db_session.execute(select(Document))).scalars().all()

    assert len(doc_types) == 2
    # 4 assigned docs (2 types * 2 per type) + 2 unassigned docs
    assert len(documents) == 6

    assigned_docs = [d for d in documents if d.ai_suggested_required_document_type_id is not None]
    unassigned_docs = [d for d in documents if d.ai_suggested_required_document_type_id is None]
    assert len(assigned_docs) == 4
    assert len(unassigned_docs) == 2

    for doc_type in doc_types:
        assert doc_type.project_id == project_id
        assert doc_type.category is not None
        assert doc_type.name is not None
        assert doc_type.confidence is not None


@pytest.mark.asyncio
async def test_delete_all_for_project(db_session: AsyncSession) -> None:
    """Verifies cascade deletion works and doesn't affect other projects."""
    project_a = uuid.uuid4()
    project_b = uuid.uuid4()

    results = create_test_results(num_doc_types=1, docs_per_type=1)

    await bulk_insert_results(project_a, results, db_session)
    await bulk_insert_results(project_b, results, db_session)
    await db_session.commit()

    await delete_all_for_project(project_a, db_session)
    await db_session.commit()

    remaining_types = (await db_session.execute(select(DocumentType))).scalars().all()
    remaining_docs = (await db_session.execute(select(Document))).scalars().all()

    assert len(remaining_types) == 1
    assert remaining_types[0].project_id == project_b
    # 1 assigned doc + 2 unassigned docs for project_b
    assert len(remaining_docs) == 3
    for doc in remaining_docs:
        assert doc.project_id == project_b


@pytest.mark.asyncio
async def test_delete_all_for_project_keeps_other_versions(db_session: AsyncSession) -> None:
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=1, docs_per_type=1)

    await bulk_insert_results(project_id, results, db_session, project_version=1)
    await bulk_insert_results(project_id, results, db_session, project_version=2)
    await db_session.commit()

    await delete_all_for_project(project_id, db_session, project_version=2)
    await db_session.commit()

    remaining_types = (
        (await db_session.execute(select(DocumentType).where(DocumentType.project_id == project_id))).scalars().all()
    )
    remaining_docs = (
        (await db_session.execute(select(Document).where(Document.project_id == project_id))).scalars().all()
    )

    assert remaining_types
    assert remaining_docs
    assert {row.project_version for row in remaining_types} == {1}
    assert {row.project_version for row in remaining_docs} == {1}


@pytest.mark.asyncio
async def test_replace_results_for_files_replaces_candidates_and_keeps_unchanged_rows(
    db_session: AsyncSession,
) -> None:
    project_id = uuid.uuid4()
    unchanged_file_id = uuid.uuid4()
    candidate_file_id = uuid.uuid4()

    initial = FormalCompletenessCheckResults(
        matched_document_types=[
            MatchedDocumentTypeOutput(
                required_document_type=DocumentTypeDefinition(
                    category="Category",
                    document_type_name="Unchanged Type",
                    document_type_description="Unchanged description",
                ),
                assigned_documents=[
                    AssignedDocument(
                        document_id=unchanged_file_id,
                        document_name="unchanged.pdf",
                        reasoning="kept",
                        confidence=0.8,
                    )
                ],
                confidence=0.8,
            ),
            MatchedDocumentTypeOutput(
                required_document_type=DocumentTypeDefinition(
                    category="Category",
                    document_type_name="Candidate Type",
                    document_type_description="Old candidate description",
                ),
                assigned_documents=[
                    AssignedDocument(
                        document_id=candidate_file_id,
                        document_name="candidate-old.pdf",
                        reasoning="old",
                        confidence=0.4,
                    )
                ],
                confidence=0.4,
            ),
        ],
        unassigned_documents=[],
    )
    replacement = FormalCompletenessCheckResults(
        matched_document_types=[
            MatchedDocumentTypeOutput(
                required_document_type=DocumentTypeDefinition(
                    category="Category",
                    document_type_name="Candidate Type",
                    document_type_description="New candidate description",
                ),
                assigned_documents=[
                    AssignedDocument(
                        document_id=candidate_file_id,
                        document_name="candidate-new.pdf",
                        reasoning="new",
                        confidence=0.95,
                    )
                ],
                confidence=0.95,
            )
        ],
        unassigned_documents=[],
    )

    await bulk_insert_results(project_id, initial, db_session)
    await db_session.commit()

    deleted_count = await replace_results_for_files(project_id, replacement, db_session)
    await db_session.commit()

    documents = (
        (
            await db_session.execute(
                select(Document).where(
                    Document.project_id == project_id,
                    Document.file_id.in_([unchanged_file_id, candidate_file_id]),
                )
            )
        )
        .scalars()
        .all()
    )
    docs_by_file_id = {doc.file_id: doc for doc in documents}
    candidate_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Candidate Type",
            )
        )
    ).scalar_one()

    assert deleted_count == 1
    assert set(docs_by_file_id) == {unchanged_file_id, candidate_file_id}
    assert docs_by_file_id[unchanged_file_id].document_name == "unchanged.pdf"
    assert docs_by_file_id[candidate_file_id].document_name == "candidate-new.pdf"
    assert docs_by_file_id[candidate_file_id].confidence == 0.95
    assert candidate_type.description == "New candidate description"


@pytest.mark.asyncio
async def test_get_results_for_project_empty(db_session: AsyncSession) -> None:
    """Verifies empty state handling."""
    project_id = uuid.uuid4()

    results = await get_results_for_project(project_id, db_session)

    assert results.matched_document_types == []
    assert results.unassigned_documents == []


@pytest.mark.asyncio
async def test_get_results_for_project_with_data(db_session: AsyncSession) -> None:
    """Verifies full round-trip: insert -> retrieve -> reconstruct schema."""
    project_id = uuid.uuid4()
    original = create_test_results(num_doc_types=2, docs_per_type=2)

    await bulk_insert_results(project_id, original, db_session)
    await db_session.commit()

    retrieved = await get_results_for_project(project_id, db_session)

    assert len(retrieved.matched_document_types) == 2

    for i, matched in enumerate(retrieved.matched_document_types):
        original_type = original.matched_document_types[i].required_document_type
        assert matched.required_document_type.category == original_type.category
        assert matched.required_document_type.document_type_name == original_type.document_type_name
        assert matched.required_document_type.document_type_description == original_type.document_type_description
        assert matched.confidence == original.matched_document_types[i].confidence
        assert len(matched.assigned_documents) == 2

    retrieved_names = {doc.document_name for doc in retrieved.unassigned_documents}
    original_names = {doc.document_name for doc in original.unassigned_documents}
    assert retrieved_names == original_names


@pytest.mark.asyncio
async def test_get_results_for_project_returns_latest_version(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    old_results = create_test_results(num_doc_types=1, docs_per_type=1)
    new_results = create_test_results(num_doc_types=1, docs_per_type=1)
    new_results.matched_document_types[0].required_document_type.document_type_name = "Latest Document Type"

    await bulk_insert_results(project_id, old_results, db_session, project_version=1)
    await bulk_insert_results(project_id, new_results, db_session, project_version=2)
    await db_session.commit()

    retrieved = await get_results_for_project(project_id, db_session)

    assert len(retrieved.matched_document_types) == 1
    assert retrieved.matched_document_types[0].required_document_type.document_type_name == "Latest Document Type"


# --- Required documents by category tests ---


@pytest.mark.asyncio
async def test_get_required_document_types_by_category_empty(
    db_session: AsyncSession,
) -> None:
    """Verifies empty list for a project with no categories."""
    project_id = uuid.uuid4()

    result = await get_required_document_types_by_category(project_id, db_session)

    assert result.categories == []


@pytest.mark.asyncio
async def test_get_required_document_types_by_category_with_data(
    db_session: AsyncSession,
) -> None:
    """Verifies categories with their document types are returned correctly."""
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=2, docs_per_type=1)

    await bulk_insert_results(project_id, results, db_session)
    await db_session.commit()

    response = await get_required_document_types_by_category(project_id, db_session)
    categories = response.categories

    # bulk_insert_results creates 2 named categories + 1 "Benutzerdefiniert"
    assert len(categories) == 3

    # Results are ordered by category name ascending
    category_names = [c.category_name for c in categories]
    assert category_names == sorted(category_names)

    # Find the non-custom categories (each should have 1 document type)
    non_custom = [c for c in categories if c.category_name != CUSTOM_CATEGORY_NAME]
    assert len(non_custom) == 2
    for cat in non_custom:
        assert len(cat.required_documents) == 1
        assert cat.required_documents[0].document_name in [
            "Document Type 0",
            "Document Type 1",
        ]
        assert cat.required_documents[0].origin == "system"

    # Custom category should have no document types
    custom = [c for c in categories if c.category_name == CUSTOM_CATEGORY_NAME]
    assert len(custom) == 1
    assert custom[0].required_documents == []


@pytest.mark.asyncio
async def test_get_required_document_types_by_category_returns_latest_version(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    old_results = create_test_results(num_doc_types=1, docs_per_type=0)
    new_results = create_test_results(num_doc_types=1, docs_per_type=0)
    old_results.matched_document_types[0].required_document_type.document_type_name = "Old Type"
    new_results.matched_document_types[0].required_document_type.document_type_name = "New Type"

    await bulk_insert_results(project_id, old_results, db_session, project_version=1)
    await bulk_insert_results(project_id, new_results, db_session, project_version=2)
    await db_session.commit()

    response = await get_required_document_types_by_category(project_id, db_session)
    names = {
        required_doc.document_name for category in response.categories for required_doc in category.required_documents
    }

    assert "New Type" in names
    assert "Old Type" not in names

    response = await get_required_document_types_by_category(
        project_id,
        db_session,
        project_version=1,
    )
    names = {
        required_doc.document_name for category in response.categories for required_doc in category.required_documents
    }

    assert "Old Type" in names
    assert "New Type" not in names


@pytest.mark.asyncio
async def test_initialize_required_document_types_from_templates_seeds_project_baseline(
    db_session: AsyncSession,
) -> None:
    project_id = uuid.uuid4()
    project_type_id = uuid.uuid4()
    template_category, _ = await _seed_template(
        db_session,
        project_type_id,
        category_name="Template Category",
        document_type_name="Existing System Type",
    )
    db_session.add(
        TemplateDocumentType(
            template_category_id=template_category.id,
            name="Missing System Type",
            description="Missing description",
            expected_count=1,
        )
    )

    existing_category = Category(project_id=project_id, project_version=1, name="Template Category")
    custom_category = Category(project_id=project_id, project_version=1, name=CUSTOM_CATEGORY_NAME)
    db_session.add_all([existing_category, custom_category])
    await db_session.flush()
    existing_system_type = DocumentType(
        project_id=project_id,
        project_version=1,
        category_id=existing_category.id,
        name="Existing System Type",
        description="Old description",
        confidence=0.77,
        is_resolved=True,
        origin="system",
    )
    custom_type = DocumentType(
        project_id=project_id,
        project_version=1,
        category_id=custom_category.id,
        name="Custom Type",
        description="",
        is_resolved=True,
        origin="custom",
    )
    db_session.add_all([existing_system_type, custom_type])
    await db_session.commit()

    await initialize_required_document_types_from_templates(
        project_id,
        project_type_id,
        db_session,
        project_version=1,
    )
    await initialize_required_document_types_from_templates(
        project_id,
        project_type_id,
        db_session,
        project_version=1,
    )

    document_types = (
        (
            await db_session.execute(
                select(DocumentType).where(
                    DocumentType.project_id == project_id,
                    DocumentType.project_version == 1,
                    DocumentType.is_deleted.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    document_types_by_name = {document_type.name: document_type for document_type in document_types}
    project_template_version = (
        await db_session.execute(select(ProjectTemplateVersion).where(ProjectTemplateVersion.project_id == project_id))
    ).scalar_one()

    assert project_template_version.project_type_id == project_type_id
    assert set(document_types_by_name) == {"Existing System Type", "Missing System Type", "Custom Type"}
    assert document_types_by_name["Existing System Type"].id == existing_system_type.id
    assert document_types_by_name["Existing System Type"].description == "A test document"
    assert document_types_by_name["Existing System Type"].confidence == 0.77
    assert document_types_by_name["Existing System Type"].is_resolved is True
    assert document_types_by_name["Missing System Type"].origin == "system"
    assert document_types_by_name["Custom Type"].id == custom_type.id
    assert document_types_by_name["Custom Type"].is_resolved is True


# --- patch_document_by_file_id tests ---


@pytest.mark.asyncio
async def test_patch_document_by_file_id_sets_human_assignment(
    db_session: AsyncSession,
) -> None:
    """Setting human_required_document_type_id assigns the document to a type."""
    project_id = uuid.uuid4()

    doc_type = DocumentType(
        project_id=project_id,
        category_id=None,
        name="Target Type",
        description="",
    )
    db_session.add(doc_type)
    await db_session.flush()

    file_id = uuid.uuid4()
    doc = Document(
        project_id=project_id,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="doc.pdf",
        reasoning=None,
        confidence=None,
    )
    db_session.add(doc)
    await db_session.commit()

    result = await patch_document_by_file_id(
        project_id=project_id,
        file_id=file_id,
        patch={"human_required_document_type_id": doc_type.id},
        db=db_session,
    )

    assert isinstance(result, DocumentAssignmentItem)
    assert result.file_id == file_id
    assert result.human_required_document_type_id == doc_type.id
    await db_session.refresh(doc)
    assert doc.human_required_document_type_id == doc_type.id


@pytest.mark.asyncio
async def test_patch_document_by_file_id_clears_human_assignment(
    db_session: AsyncSession,
) -> None:
    """Setting human_required_document_type_id to None clears the assignment."""
    project_id = uuid.uuid4()

    doc_type = DocumentType(
        project_id=project_id,
        category_id=None,
        name="Some Type",
        description="",
    )
    db_session.add(doc_type)
    await db_session.flush()

    file_id = uuid.uuid4()
    doc = Document(
        project_id=project_id,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="doc.pdf",
        reasoning=None,
        confidence=None,
    )
    doc.human_required_document_type_id = doc_type.id
    db_session.add(doc)
    await db_session.commit()

    result = await patch_document_by_file_id(
        project_id=project_id,
        file_id=file_id,
        patch={"human_required_document_type_id": None},
        db=db_session,
    )

    assert isinstance(result, DocumentAssignmentItem)
    assert result.file_id == file_id
    assert result.human_required_document_type_id is None
    await db_session.refresh(doc)
    assert doc.human_required_document_type_id is None


@pytest.mark.asyncio
async def test_patch_document_by_file_id_empty_patch_is_noop(
    db_session: AsyncSession,
) -> None:
    """An empty patch dict does not modify the document."""
    project_id = uuid.uuid4()

    doc_type = DocumentType(
        project_id=project_id,
        category_id=None,
        name="Some Type",
        description="",
    )
    db_session.add(doc_type)
    await db_session.flush()

    file_id = uuid.uuid4()
    doc = Document(
        project_id=project_id,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="doc.pdf",
        reasoning=None,
        confidence=None,
    )
    doc.human_required_document_type_id = doc_type.id
    db_session.add(doc)
    await db_session.commit()

    result = await patch_document_by_file_id(
        project_id=project_id,
        file_id=file_id,
        patch={},
        db=db_session,
    )

    assert isinstance(result, DocumentAssignmentItem)
    assert result.file_id == file_id
    assert result.human_required_document_type_id == doc_type.id
    await db_session.refresh(doc)
    assert doc.human_required_document_type_id == doc_type.id


@pytest.mark.asyncio
async def test_patch_document_by_file_id_target_type_missing(
    db_session: AsyncSession,
) -> None:
    """Setting human_required_document_type_id to a non-existent type raises NotFoundError."""
    project_id = uuid.uuid4()

    file_id = uuid.uuid4()
    doc = Document(
        project_id=project_id,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="doc.pdf",
        reasoning=None,
        confidence=None,
    )
    db_session.add(doc)
    await db_session.commit()

    with pytest.raises(NotFoundError, match="Document type not found"):
        await patch_document_by_file_id(
            project_id=project_id,
            file_id=file_id,
            patch={"human_required_document_type_id": uuid.uuid4()},
            db=db_session,
        )


@pytest.mark.asyncio
async def test_patch_document_by_file_id_not_found(db_session: AsyncSession) -> None:
    """Patching a non-existent file_id raises NotFoundError."""
    project_id = uuid.uuid4()

    with pytest.raises(NotFoundError, match="Document not found"):
        await patch_document_by_file_id(
            project_id=project_id,
            file_id=uuid.uuid4(),
            patch={"human_required_document_type_id": None},
            db=db_session,
        )


@pytest.mark.asyncio
async def test_patch_document_by_file_id_updates_latest_version_only(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    file_id = uuid.uuid4()
    old_document = Document(
        project_id=project_id,
        project_version=1,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="old.pdf",
    )
    latest_document = Document(
        project_id=project_id,
        project_version=2,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="latest.pdf",
    )
    latest_type = DocumentType(
        project_id=project_id,
        project_version=2,
        category_id=None,
        name="Latest Type",
        description="",
    )
    db_session.add_all([old_document, latest_document, latest_type])
    await db_session.commit()

    await patch_document_by_file_id(
        project_id=project_id,
        file_id=file_id,
        patch={"human_required_document_type_id": latest_type.id},
        db=db_session,
    )
    await db_session.refresh(old_document)
    await db_session.refresh(latest_document)

    assert old_document.human_required_document_type_id is None
    assert latest_document.human_required_document_type_id == latest_type.id


# --- Custom document type CRUD tests ---


async def _setup_custom_category(project_id: uuid.UUID, db: AsyncSession, *, project_version: int = 1) -> Category:
    """Helper: create the 'Benutzerdefiniert' category for a project."""
    category = Category(project_id=project_id, project_version=project_version, name=CUSTOM_CATEGORY_NAME)
    db.add(category)
    await db.flush()
    return category


@pytest.mark.asyncio
async def test_create_custom_document_type(db_session: AsyncSession) -> None:
    """Creating a custom document type in the Benutzerdefiniert category."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)

    result = await create_custom_document_type(project_id, "My Custom Type", db_session)

    assert isinstance(result, RequiredDocumentResponse)
    assert result.document_name == "My Custom Type"
    assert result.origin == "custom"
    assert result.is_resolved is False

    saved = (
        await db_session.execute(
            select(DocumentType)
            .options(selectinload(DocumentType.category))
            .where(
                DocumentType.project_id == project_id,
                DocumentType.name == "My Custom Type",
            )
        )
    ).scalar_one()
    assert saved.name == "My Custom Type"
    assert saved.description == ""
    assert saved.confidence is None
    assert saved.category is not None
    assert saved.category.name == CUSTOM_CATEGORY_NAME
    assert str(saved.id) == str(result.document_type_id)


@pytest.mark.asyncio
async def test_create_custom_document_type_no_category(
    db_session: AsyncSession,
) -> None:
    """Creating a custom document type fails when the category doesn't exist."""
    project_id = uuid.uuid4()
    with pytest.raises(NotFoundError, match="not found"):
        await create_custom_document_type(project_id, "Should Fail", db_session)


@pytest.mark.asyncio
async def test_create_custom_document_type_uses_latest_category_version(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    await _setup_custom_category(project_id, db_session, project_version=1)
    await _setup_custom_category(project_id, db_session, project_version=2)

    result = await create_custom_document_type(project_id, "Latest Custom Type", db_session)
    saved = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.id == result.document_type_id,
            )
        )
    ).scalar_one()

    assert saved.project_version == 2


@pytest.mark.asyncio
async def test_patch_required_document_type_rename_custom(
    db_session: AsyncSession,
) -> None:
    """Renaming a custom document type succeeds."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)
    await create_custom_document_type(project_id, "Original Name", db_session)

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Original Name",
            )
        )
    ).scalar_one()

    result = await patch_required_document_type(project_id, doc_type.id, {"document_name": "New Name"}, db_session)

    assert isinstance(result, RequiredDocumentResponse)
    assert result.document_name == "New Name"
    assert result.origin == "custom"
    await db_session.refresh(doc_type)
    assert doc_type.name == "New Name"


@pytest.mark.asyncio
async def test_patch_required_document_type_not_found(db_session: AsyncSession) -> None:
    """Patching a non-existent document type raises NotFoundError."""
    project_id = uuid.uuid4()
    with pytest.raises(NotFoundError):
        await patch_required_document_type(project_id, uuid.uuid4(), {"is_resolved": True}, db_session)


@pytest.mark.asyncio
async def test_patch_required_document_type_rename_system_forbidden(
    db_session: AsyncSession,
) -> None:
    """Renaming a system document type raises ForbiddenError."""
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=1, docs_per_type=0)
    await bulk_insert_results(project_id, results, db_session)
    await db_session.commit()

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Document Type 0",
            )
        )
    ).scalar_one()

    with pytest.raises(ForbiddenError):
        await patch_required_document_type(project_id, doc_type.id, {"document_name": "Hacked"}, db_session)


@pytest.mark.asyncio
async def test_patch_required_document_type_resolve_system_allowed(
    db_session: AsyncSession,
) -> None:
    """Setting is_resolved on a system document type is always allowed."""
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=1, docs_per_type=0)
    await bulk_insert_results(project_id, results, db_session)
    await db_session.commit()

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Document Type 0",
            )
        )
    ).scalar_one()

    result = await patch_required_document_type(project_id, doc_type.id, {"is_resolved": True}, db_session)

    assert isinstance(result, RequiredDocumentResponse)
    assert result.is_resolved is True
    assert result.origin == "system"
    await db_session.refresh(doc_type)
    assert doc_type.is_resolved is True


@pytest.mark.asyncio
async def test_delete_custom_document_type(db_session: AsyncSession) -> None:
    """Soft deleting a custom document type sets deleted flag."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)
    await create_custom_document_type(project_id, "To Delete", db_session)

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "To Delete",
            )
        )
    ).scalar_one()

    await delete_custom_document_type(project_id, doc_type.id, db_session)
    await db_session.commit()

    remaining = (
        await db_session.execute(select(DocumentType).where(DocumentType.id == doc_type.id))
    ).scalar_one_or_none()
    assert remaining is not None
    assert remaining.is_deleted is True


@pytest.mark.asyncio
async def test_delete_custom_document_type_not_found(db_session: AsyncSession) -> None:
    """Deleting a non-existent document type raises NotFoundError."""
    project_id = uuid.uuid4()
    with pytest.raises(NotFoundError):
        await delete_custom_document_type(project_id, uuid.uuid4(), db_session)


@pytest.mark.asyncio
async def test_delete_system_document_type_forbidden(db_session: AsyncSession) -> None:
    """Deleting a system document type raises ForbiddenError."""
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=1, docs_per_type=0)
    await bulk_insert_results(project_id, results, db_session)
    await db_session.commit()

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Document Type 0",
            )
        )
    ).scalar_one()

    with pytest.raises(ForbiddenError):
        await delete_custom_document_type(project_id, doc_type.id, db_session)


@pytest.mark.asyncio
async def test_delete_custom_document_type_unassigns_documents(
    db_session: AsyncSession,
) -> None:
    """Soft deleting a custom document type unassigns all associated documents."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)
    await create_custom_document_type(project_id, "To Delete With Docs", db_session)

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "To Delete With Docs",
            )
        )
    ).scalar_one()

    doc1 = Document(
        id=uuid.uuid4(),
        project_id=project_id,
        file_id=uuid.uuid4(),
        ai_suggested_required_document_type_id=doc_type.id,
        document_name="doc1.pdf",
    )
    doc2 = Document(
        id=uuid.uuid4(),
        project_id=project_id,
        file_id=uuid.uuid4(),
        ai_suggested_required_document_type_id=doc_type.id,
        document_name="doc2.pdf",
    )
    db_session.add_all([doc1, doc2])
    await db_session.commit()

    await delete_custom_document_type(project_id, doc_type.id, db_session)
    await db_session.commit()

    documents = (await db_session.execute(select(Document).where(Document.id.in_([doc1.id, doc2.id])))).scalars().all()
    assert len(documents) == 2
    for doc in documents:
        assert doc.ai_suggested_required_document_type_id is None


@pytest.mark.asyncio
async def test_delete_custom_document_type_clears_human_assignments(
    db_session: AsyncSession,
) -> None:
    """Soft deleting a custom document type also clears human_required_document_type_id references."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)
    await create_custom_document_type(project_id, "Custom Type", db_session)

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Custom Type",
            )
        )
    ).scalar_one()

    file_id = uuid.uuid4()
    doc = Document(
        project_id=project_id,
        file_id=file_id,
        ai_suggested_required_document_type_id=None,
        document_name="manually_assigned.pdf",
    )
    doc.human_required_document_type_id = doc_type.id
    db_session.add(doc)
    await db_session.commit()

    await delete_custom_document_type(project_id, doc_type.id, db_session)
    await db_session.commit()

    await db_session.refresh(doc)
    assert doc.human_required_document_type_id is None


@pytest.mark.asyncio
async def test_soft_deleted_document_types_not_in_query_results(
    db_session: AsyncSession,
) -> None:
    """Soft deleted document types should not appear in query results."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)

    await create_custom_document_type(project_id, "Active Type", db_session)
    await create_custom_document_type(project_id, "To Delete Type", db_session)

    doc_type2 = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "To Delete Type",
            )
        )
    ).scalar_one()

    await delete_custom_document_type(project_id, doc_type2.id, db_session)
    await db_session.commit()

    # get_results_for_project should exclude soft-deleted types
    results = await get_results_for_project(project_id, db_session)
    doc_type_names = [dt.required_document_type.document_type_name for dt in results.matched_document_types]
    assert "Active Type" in doc_type_names
    assert "To Delete Type" not in doc_type_names

    # get_required_document_types_by_category should also exclude soft-deleted
    response = await get_required_document_types_by_category(project_id, db_session)
    custom_category = next(
        (cat for cat in response.categories if cat.category_name == CUSTOM_CATEGORY_NAME),
        None,
    )
    assert custom_category is not None

    doc_names = [doc.document_name for doc in custom_category.required_documents]
    assert "Active Type" in doc_names
    assert "To Delete Type" not in doc_names


@pytest.mark.asyncio
async def test_create_custom_document_type_after_soft_delete(db_session: AsyncSession) -> None:
    """Recreating a custom document type with a previously soft-deleted name must succeed."""
    project_id = uuid.uuid4()
    await _setup_custom_category(project_id, db_session)

    await create_custom_document_type(project_id, "Reused Name", db_session)
    await db_session.commit()

    doc_type = (
        await db_session.execute(
            select(DocumentType).where(
                DocumentType.project_id == project_id,
                DocumentType.name == "Reused Name",
            )
        )
    ).scalar_one()

    await delete_custom_document_type(project_id, doc_type.id, db_session)
    await db_session.commit()

    result = await create_custom_document_type(project_id, "Reused Name", db_session)
    await db_session.commit()

    assert isinstance(result, RequiredDocumentResponse)
    assert result.document_name == "Reused Name"
    assert result.document_type_id != doc_type.id


@pytest.mark.asyncio
async def test_get_document_assignments(db_session: AsyncSession) -> None:
    """get_document_assignments returns AI and human assignments per file."""
    project_id = uuid.uuid4()
    results = create_test_results(num_doc_types=1, docs_per_type=1)
    await bulk_insert_results(project_id, results, db_session)
    await db_session.commit()

    response = await get_document_assignments(project_id, db_session, project_version=1)

    assert len(response.items) > 0
    for item in response.items:
        assert item.file_id is not None
        # human assignment starts as None
        assert item.human_required_document_type_id is None


@pytest.mark.asyncio
async def test_get_document_assignments_returns_latest_version(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    old_file_id = uuid.uuid4()
    latest_file_id = uuid.uuid4()
    db_session.add_all(
        [
            Document(
                project_id=project_id,
                project_version=1,
                file_id=old_file_id,
                ai_suggested_required_document_type_id=None,
                document_name="old.pdf",
            ),
            Document(
                project_id=project_id,
                project_version=2,
                file_id=latest_file_id,
                ai_suggested_required_document_type_id=None,
                document_name="latest.pdf",
            ),
        ]
    )
    await db_session.commit()

    response = await get_document_assignments(project_id, db_session)

    assert [item.file_id for item in response.items] == [latest_file_id]

    response = await get_document_assignments(project_id, db_session, project_version=1)

    assert [item.file_id for item in response.items] == [old_file_id]


# --- get_template_document_types tests ---


@pytest.mark.asyncio
async def test_get_template_document_types_already_registered(
    db_session: AsyncSession,
) -> None:
    """get_template_document_types returns templates directly when PTV already exists."""
    project_id = uuid.uuid4()
    project_type_id = uuid.uuid4()
    _, _ = await _seed_template(db_session, project_type_id)
    db_session.add(ProjectTemplateVersion(project_id=project_id, project_version=2, project_type_id=project_type_id))
    await db_session.commit()

    with patch("src.services.fcs_service._fetch_project_type_id") as mock_fetch:
        result = await get_template_document_types(project_id, db_session, project_version=2)

    mock_fetch.assert_not_called()
    assert len(result) == 1
    assert result[0].category == "Test Category"
    assert result[0].document_type_name == "Test Template Doc"
    assert result[0].expected_count == 1


@pytest.mark.asyncio
async def test_get_template_document_types_auto_registers_via_pls(
    db_session: AsyncSession,
) -> None:
    """get_template_document_types fetches project_type_id from PLS and registers on first call."""
    project_id = uuid.uuid4()
    project_type_id = uuid.uuid4()
    await _seed_template(db_session, project_type_id)

    with patch(
        "src.services.fcs_service._fetch_project_type_id",
        new=AsyncMock(return_value=project_type_id),
    ):
        result = await get_template_document_types(project_id, db_session, project_version=3)

    assert len(result) == 1
    assert result[0].document_type_name == "Test Template Doc"

    ptv = (
        await db_session.execute(select(ProjectTemplateVersion).where(ProjectTemplateVersion.project_id == project_id))
    ).scalar_one()
    assert ptv.project_type_id == project_type_id
    assert ptv.project_version == 3


@pytest.mark.asyncio
async def test_get_template_document_types_pls_not_configured_raises(
    db_session: AsyncSession,
) -> None:
    """get_template_document_types raises NotFoundError when PROJECT_LOGIC_SERVICE_URL is unset."""
    project_id = uuid.uuid4()

    with patch("src.services.fcs_service.settings") as mock_settings:
        mock_settings.PROJECT_LOGIC_SERVICE_URL = ""
        with pytest.raises(NotFoundError, match="PROJECT_LOGIC_SERVICE_URL"):
            await get_template_document_types(project_id, db_session, project_version=1)


@pytest.mark.asyncio
async def test_get_template_document_types_pls_project_not_found_raises(
    db_session: AsyncSession,
) -> None:
    """get_template_document_types raises NotFoundError when PLS returns 404."""
    project_id = uuid.uuid4()

    with (
        patch(
            "src.services.fcs_service._fetch_project_type_id",
            new=AsyncMock(side_effect=NotFoundError(f"Project {project_id} not found in PLS")),
        ),
        pytest.raises(NotFoundError, match="not found in PLS"),
    ):
        await get_template_document_types(project_id, db_session, project_version=1)


@pytest.mark.asyncio
async def test_get_template_document_types_filters_by_project_type(
    db_session: AsyncSession,
) -> None:
    """get_template_document_types only returns templates for the project's project type."""
    project_id = uuid.uuid4()
    project_type_a = uuid.uuid4()
    project_type_b = uuid.uuid4()

    await _seed_template(
        db_session,
        project_type_a,
        category_name="Category A",
        document_type_name="Doc A",
    )
    await _seed_template(
        db_session,
        project_type_b,
        category_name="Category B",
        document_type_name="Doc B",
    )
    db_session.add(ProjectTemplateVersion(project_id=project_id, project_version=1, project_type_id=project_type_a))
    await db_session.commit()

    result = await get_template_document_types(project_id, db_session, project_version=1)

    category_names = [r.category for r in result]
    assert "Category A" in category_names
    assert "Category B" not in category_names


@pytest.mark.asyncio
async def test_get_template_document_types_uses_requested_project_version(
    db_session: AsyncSession,
) -> None:
    """get_template_document_types selects the project template row for the requested version."""
    project_id = uuid.uuid4()
    project_type_v1 = uuid.uuid4()
    project_type_v2 = uuid.uuid4()

    await _seed_template(
        db_session,
        project_type_v1,
        category_name="Category V1",
        document_type_name="Doc V1",
    )
    await _seed_template(
        db_session,
        project_type_v2,
        category_name="Category V2",
        document_type_name="Doc V2",
    )
    db_session.add_all(
        [
            ProjectTemplateVersion(project_id=project_id, project_version=1, project_type_id=project_type_v1),
            ProjectTemplateVersion(project_id=project_id, project_version=2, project_type_id=project_type_v2),
        ]
    )
    await db_session.commit()

    result = await get_template_document_types(project_id, db_session, project_version=2)

    assert [item.document_type_name for item in result] == ["Doc V2"]


@pytest.mark.asyncio
async def test_fcs_service_audit_logs(
    db_session: AsyncSession,
    mock_record_audit_entry: AsyncMock,
) -> None:
    project_id = uuid.uuid4()
    audit_ctx = {"actor_user_id": uuid.uuid4()}

    # 1. Test create_custom_document_type
    await _setup_custom_category(project_id, db_session)
    doc_type = await create_custom_document_type(project_id, "Custom Doc", db_session, audit_context=audit_ctx)
    mock_record_audit_entry.assert_awaited_once_with(
        db_session,
        project_id=project_id,
        entity_type="document_type",
        change_type=ChangeType.CREATE,
        entity_id=doc_type.document_type_id,
        actor_user_id=audit_ctx["actor_user_id"],
    )
    mock_record_audit_entry.reset_mock()

    # 2. Test patch_required_document_type
    await patch_required_document_type(
        project_id,
        doc_type.document_type_id,
        {"document_name": "Updated Custom Doc"},
        db_session,
        audit_context=audit_ctx,
    )
    mock_record_audit_entry.assert_awaited_once_with(
        db_session,
        project_id=project_id,
        entity_type="document_type",
        change_type=ChangeType.UPDATE,
        entity_id=doc_type.document_type_id,
        actor_user_id=audit_ctx["actor_user_id"],
    )
    mock_record_audit_entry.reset_mock()

    # 3. Test patch_document_by_file_id
    # Create a document
    file_id = uuid.uuid4()
    document = Document(
        project_id=project_id,
        project_version=1,
        file_id=file_id,
        document_name="doc.pdf",
    )
    db_session.add(document)
    await db_session.commit()

    await patch_document_by_file_id(
        project_id,
        file_id,
        {"human_required_document_type_id": doc_type.document_type_id},
        db_session,
        audit_context=audit_ctx,
    )
    mock_record_audit_entry.assert_awaited_once_with(
        db_session,
        project_id=project_id,
        entity_type="document",
        change_type=ChangeType.UPDATE,
        entity_id=document.id,
        actor_user_id=audit_ctx["actor_user_id"],
    )
    mock_record_audit_entry.reset_mock()

    # 4. Test delete_custom_document_type
    await delete_custom_document_type(
        project_id,
        doc_type.document_type_id,
        db_session,
        audit_context=audit_ctx,
    )
    mock_record_audit_entry.assert_awaited_once_with(
        db_session,
        project_id=project_id,
        entity_type="document_type",
        change_type=ChangeType.DELETE,
        entity_id=doc_type.document_type_id,
        actor_user_id=audit_ctx["actor_user_id"],
    )
