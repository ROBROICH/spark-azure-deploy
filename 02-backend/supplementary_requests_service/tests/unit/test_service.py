"""Unit tests for supplementary request service."""

import uuid
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import (
    DuplicateSourceBindingError,
    InvalidSortParameterError,
    SupplementaryRequestNotFoundError,
)
from src.models.db.db_models import SupplementaryRequest
from src.models.db.enums import Priority, SourceType
from src.models.schemas.supplementary_request_schemas import (
    CreateSupplementaryRequestRequest,
    SourceRef,
    UpdateSupplementaryRequestRequest,
)
from src.services.supplementary_requests import supplementary_request_service

TOPIC_ID = uuid.uuid4()
DOCUMENT_ID = uuid.uuid4()


@pytest.mark.asyncio
async def test_create_supplementary_request(db_session: AsyncSession):
    """Test creating a new supplementary request."""
    project_id = uuid.uuid4()
    request_data = CreateSupplementaryRequestRequest(
        title="New Request",
        reason="Some reason",
        priority="must",
        included_in_letter=True,
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )

    result = await supplementary_request_service.create_supplementary_request(db_session, project_id, request_data)

    assert result.project_id == project_id
    assert result.title == "New Request"
    assert result.reason == "Some reason"
    assert result.priority == Priority.MUST
    assert result.process_step is None
    assert result.included_in_letter is True
    assert result.source_type is None
    assert result.source_item_id is None
    assert isinstance(result.id, UUID)


@pytest.mark.asyncio
async def test_create_with_source_ref(db_session: AsyncSession):
    """Test creating a request with source_ref decomposes into flat columns."""
    project_id = uuid.uuid4()
    request_data = CreateSupplementaryRequestRequest(
        title="With source",
        priority="should",
        source_ref=SourceRef(type="requiredDocuments", item_id="doc-42"),
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )

    result = await supplementary_request_service.create_supplementary_request(db_session, project_id, request_data)

    assert result.source_type == SourceType.REQUIRED_DOCUMENTS
    assert result.source_item_id == "doc-42"


@pytest.mark.asyncio
async def test_create_defaults(db_session: AsyncSession):
    """Test that reason defaults to empty string and included_in_letter to False."""
    project_id = uuid.uuid4()
    request_data = CreateSupplementaryRequestRequest(
        title="Minimal",
        priority="must",
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )

    result = await supplementary_request_service.create_supplementary_request(db_session, project_id, request_data)

    assert result.reason == ""
    assert result.included_in_letter is False


@pytest.mark.asyncio
async def test_get_supplementary_request_for_project(db_session: AsyncSession, create_test_supplementary_request):
    """Test retrieving a supplementary request."""
    request = create_test_supplementary_request

    result = await supplementary_request_service.get_supplementary_request_for_project(
        db_session, request.project_id, request.id
    )

    assert result.id == request.id
    assert result.project_id == request.project_id
    assert result.title == request.title


@pytest.mark.asyncio
async def test_get_supplementary_request_not_found(db_session: AsyncSession):
    """Test retrieving a non-existent request raises exception."""
    with pytest.raises(SupplementaryRequestNotFoundError):
        await supplementary_request_service.get_supplementary_request_for_project(
            db_session, uuid.uuid4(), uuid.uuid4()
        )


@pytest.mark.asyncio
async def test_get_supplementary_request_wrong_project(db_session: AsyncSession, create_test_supplementary_request):
    """Test retrieving a request with wrong project ID raises exception."""
    request = create_test_supplementary_request

    with pytest.raises(SupplementaryRequestNotFoundError):
        await supplementary_request_service.get_supplementary_request_for_project(db_session, uuid.uuid4(), request.id)


@pytest.mark.asyncio
async def test_list_supplementary_requests(db_session: AsyncSession, create_test_supplementary_request):
    """Test listing requests for a project."""
    request = create_test_supplementary_request

    request2_data = CreateSupplementaryRequestRequest(
        title="Request 2",
        priority="should",
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )
    await supplementary_request_service.create_supplementary_request(db_session, request.project_id, request2_data)

    results = await supplementary_request_service.list_supplementary_requests_for_project(
        db_session, request.project_id
    )

    assert len(results) == 2


@pytest.mark.asyncio
async def test_create_ignores_legacy_process_step_input(db_session: AsyncSession):
    """Legacy process_step input is accepted but no longer persisted for new API requests."""
    project_id = uuid.uuid4()

    data = CreateSupplementaryRequestRequest(
        title="Legacy process step",
        priority="must",
        process_step="legalReview",
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )
    result = await supplementary_request_service.create_supplementary_request(db_session, project_id, data)

    assert result.process_step is None


@pytest.mark.asyncio
async def test_list_filter_by_source_type(db_session: AsyncSession):
    """Test filtering by source_type."""
    project_id = uuid.uuid4()

    await supplementary_request_service.create_supplementary_request(
        db_session,
        project_id,
        CreateSupplementaryRequestRequest(
            title="Required docs",
            priority="must",
            source_ref=SourceRef(type="requiredDocuments", item_id="doc-1"),
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        ),
    )
    await supplementary_request_service.create_supplementary_request(
        db_session,
        project_id,
        CreateSupplementaryRequestRequest(
            title="Manual source",
            priority="must",
            source_ref=SourceRef(type="manual", item_id="manual-1"),
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        ),
    )

    results = await supplementary_request_service.list_supplementary_requests_for_project(
        db_session,
        project_id,
        source_types=[SourceType.REQUIRED_DOCUMENTS],
    )

    assert len(results) == 1
    assert results[0].source_type == SourceType.REQUIRED_DOCUMENTS


@pytest.mark.asyncio
async def test_list_filter_by_included_in_letter(db_session: AsyncSession):
    """Test filtering by included_in_letter."""
    project_id = uuid.uuid4()

    data1 = CreateSupplementaryRequestRequest(
        title="Included",
        priority="must",
        process_step="formalCompletenessCheck",
        included_in_letter=True,
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )
    data2 = CreateSupplementaryRequestRequest(
        title="Not included",
        priority="must",
        process_step="formalCompletenessCheck",
        included_in_letter=False,
        topic_id=TOPIC_ID,
        document_id=DOCUMENT_ID,
    )
    await supplementary_request_service.create_supplementary_request(db_session, project_id, data1)
    await supplementary_request_service.create_supplementary_request(db_session, project_id, data2)

    results = await supplementary_request_service.list_supplementary_requests_for_project(
        db_session, project_id, included_in_letter=True
    )

    assert len(results) == 1
    assert results[0].included_in_letter is True


@pytest.mark.asyncio
async def test_list_sort_desc(db_session: AsyncSession):
    """Test sorting by created_at desc."""
    project_id = uuid.uuid4()

    for title in ["First", "Second"]:
        data = CreateSupplementaryRequestRequest(
            title=title,
            priority="must",
            process_step="formalCompletenessCheck",
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        )
        await supplementary_request_service.create_supplementary_request(db_session, project_id, data)

    results = await supplementary_request_service.list_supplementary_requests_for_project(
        db_session, project_id, sort="created_at:desc"
    )

    assert len(results) == 2
    assert results[0].created_at >= results[1].created_at


@pytest.mark.asyncio
async def test_list_sort_by_updated_at_desc(db_session: AsyncSession):
    """Test sorting by updated_at desc."""
    project_id = uuid.uuid4()
    created = []

    for title in ["First", "Second"]:
        request = await supplementary_request_service.create_supplementary_request(
            db_session,
            project_id,
            CreateSupplementaryRequestRequest(
                title=title,
                priority="must",
                process_step="formalCompletenessCheck",
                topic_id=TOPIC_ID,
                document_id=DOCUMENT_ID,
            ),
        )
        created.append(request)

    await supplementary_request_service.update_supplementary_request_for_project(
        db_session,
        project_id,
        created[0].id,
        UpdateSupplementaryRequestRequest(reason="updated reason"),
    )

    results = await supplementary_request_service.list_supplementary_requests_for_project(
        db_session, project_id, sort="updated_at:desc"
    )

    assert len(results) == 2
    assert results[0].id == created[0].id
    assert results[0].updated_at >= results[1].updated_at


@pytest.mark.asyncio
async def test_list_with_limit_offset(db_session: AsyncSession):
    """Test pagination."""
    project_id = uuid.uuid4()

    for i in range(5):
        data = CreateSupplementaryRequestRequest(
            title=f"Request {i}",
            priority="must",
            process_step="formalCompletenessCheck",
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        )
        await supplementary_request_service.create_supplementary_request(db_session, project_id, data)

    results = await supplementary_request_service.list_supplementary_requests_for_project(
        db_session, project_id, limit=2, offset=1
    )

    assert len(results) == 2


@pytest.mark.asyncio
async def test_list_invalid_sort_raises_error(db_session: AsyncSession):
    """Test invalid sort parameter raises InvalidSortParameterError."""
    with pytest.raises(InvalidSortParameterError):
        await supplementary_request_service.list_supplementary_requests_for_project(
            db_session,
            uuid.uuid4(),
            sort="invalid:asc",
        )


@pytest.mark.asyncio
async def test_list_invalid_sort_direction_raises_error(db_session: AsyncSession):
    """Test invalid sort direction raises InvalidSortParameterError."""
    with pytest.raises(InvalidSortParameterError):
        await supplementary_request_service.list_supplementary_requests_for_project(
            db_session,
            uuid.uuid4(),
            sort="created_at:invalid",
        )


@pytest.mark.asyncio
async def test_list_invalid_sort_missing_direction_raises_error(db_session: AsyncSession):
    """Test missing sort direction raises InvalidSortParameterError."""
    with pytest.raises(InvalidSortParameterError):
        await supplementary_request_service.list_supplementary_requests_for_project(
            db_session,
            uuid.uuid4(),
            sort="created_at",
        )


@pytest.mark.asyncio
async def test_update_supplementary_request(db_session: AsyncSession, create_test_supplementary_request):
    """Test updating a supplementary request."""
    request = create_test_supplementary_request
    update_data = UpdateSupplementaryRequestRequest(title="Updated Title", priority="should")

    result = await supplementary_request_service.update_supplementary_request_for_project(
        db_session, request.project_id, request.id, update_data
    )

    assert result.title == "Updated Title"
    assert result.priority == Priority.SHOULD
    assert result.reason == request.reason  # Unchanged


@pytest.mark.asyncio
async def test_update_source_ref(db_session: AsyncSession, create_test_supplementary_request):
    """Test updating source_ref decomposes correctly."""
    request = create_test_supplementary_request
    update_data = UpdateSupplementaryRequestRequest(source_ref=SourceRef(type="materialLaw", item_id="law-1"))

    result = await supplementary_request_service.update_supplementary_request_for_project(
        db_session, request.project_id, request.id, update_data
    )

    assert result.source_type == SourceType.MATERIAL_LAW
    assert result.source_item_id == "law-1"


@pytest.mark.asyncio
async def test_update_clear_source_ref(db_session: AsyncSession):
    """Test clearing source_ref sets source columns to null."""
    project_id = uuid.uuid4()
    created = await supplementary_request_service.create_supplementary_request(
        db_session,
        project_id,
        CreateSupplementaryRequestRequest(
            title="With source",
            priority="must",
            process_step="formalCompletenessCheck",
            source_ref=SourceRef(type="requiredDocuments", item_id="doc-clear"),
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        ),
    )

    updated = await supplementary_request_service.update_supplementary_request_for_project(
        db_session,
        project_id,
        created.id,
        UpdateSupplementaryRequestRequest(source_ref=None),
    )

    assert updated.source_type is None
    assert updated.source_item_id is None


@pytest.mark.asyncio
async def test_update_duplicate_source_binding_raises_conflict(db_session: AsyncSession):
    """Test update raises DuplicateSourceBindingError when binding already exists."""
    project_id = uuid.uuid4()
    first = await supplementary_request_service.create_supplementary_request(
        db_session,
        project_id,
        CreateSupplementaryRequestRequest(
            title="First",
            priority="must",
            process_step="formalCompletenessCheck",
            source_ref=SourceRef(type="requiredDocuments", item_id="doc-dup"),
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        ),
    )
    second = await supplementary_request_service.create_supplementary_request(
        db_session,
        project_id,
        CreateSupplementaryRequestRequest(
            title="Second",
            priority="must",
            process_step="formalCompletenessCheck",
            source_ref=SourceRef(type="manual", item_id="manual-dup"),
            topic_id=TOPIC_ID,
            document_id=DOCUMENT_ID,
        ),
    )

    with pytest.raises(DuplicateSourceBindingError):
        await supplementary_request_service.update_supplementary_request_for_project(
            db_session,
            project_id,
            second.id,
            UpdateSupplementaryRequestRequest(source_ref=SourceRef(type="requiredDocuments", item_id="doc-dup")),
        )

    assert first.id != second.id


@pytest.mark.asyncio
async def test_delete_supplementary_request(db_session: AsyncSession, create_test_supplementary_request):
    """Test deleting a supplementary request."""
    request = create_test_supplementary_request

    deleted = await supplementary_request_service.delete_supplementary_request_for_project(
        db_session, request.project_id, request.id
    )

    assert deleted.id == request.id

    # Verify deletion
    stmt = select(SupplementaryRequest).where(SupplementaryRequest.id == request.id)
    result = await db_session.execute(stmt)
    assert result.scalar_one_or_none() is None
