import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from io import BytesIO
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from node_crud.exceptions import ProjectVersionLockedError
from sqlalchemy.sql.expression import select
from sqlalchemy.sql.functions import func

from src.models.db.db_models import File, FileTopic, ZipFile, ZipFileDiffEntry
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import WorkflowStatusEnum, ZipDiffKind
from src.models.schemas.file_schema import (
    EwmsZipUpload,
    FileUpdateRequest,
    ProjectDocumentUpload,
    ProjectZipUpload,
    StartFileProcessingRequest,
    StartFileProcessingResponse,
    TemporalCheckpointUpload,
)
from src.services.files.file_service import FileService
from src.services.workflows.activities import update_file_status
from src.services.workflows.activities.update_workflow_status import (
    UpdateFileStatusInput,
)
from src.utils.exceptions import WorkflowInPendingStateError, WorkflowInRunningStateError
from tests.unit.conftest import MockStorageProviderService, MockWorkflowHandle

temporalio_client = pytest.importorskip("temporalio.client", reason="temporalio not installed")
temporalio_common = pytest.importorskip("temporalio.common", reason="temporalio not installed")
temporalio_exceptions = pytest.importorskip("temporalio.exceptions", reason="temporalio not installed")
WorkflowExecutionStatus = temporalio_client.WorkflowExecutionStatus
WorkflowIDConflictPolicy = temporalio_common.WorkflowIDConflictPolicy
WorkflowIDReusePolicy = temporalio_common.WorkflowIDReusePolicy
WorkflowAlreadyStartedError = temporalio_exceptions.WorkflowAlreadyStartedError


@pytest.fixture
def service(db_session):
    file_service = FileService(
        db=db_session,
        storage_provider_service=MockStorageProviderService(),
    )
    file_service._get_latest_project_version = AsyncMock(return_value=1)
    file_service._validate_project_write_version = AsyncMock(
        side_effect=lambda _project_id, project_version: project_version
    )

    async def start_workflow_side_effect(*_args: object, **kwargs: object) -> MockWorkflowHandle:
        return MockWorkflowHandle(
            workflow_id=str(kwargs["_ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID"]),
        )

    with patch("src.services.files.file_service.start_workflow", new_callable=AsyncMock) as mock_start_workflow:
        mock_start_workflow.side_effect = start_workflow_side_effect
        yield file_service


def _mock_storage_for_confirm(service):
    """Set up storage mocks so confirm_upload finds the file."""
    service.storage_provider_service.document_exists = AsyncMock(return_value=True)
    service.storage_provider_service.get_file_mime_type = AsyncMock(return_value="application/pdf")
    service.storage_provider_service.download_document_as_file_obj = AsyncMock(return_value=BytesIO(b"mock_content"))


@pytest.mark.asyncio
async def test_get_latest_project_version_accepts_camel_case_response(db_session):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"latestVersion": 7}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _url):
            return Response()

    service = FileService(
        db=db_session,
        storage_provider_service=MockStorageProviderService(),
    )

    with patch("src.services.files.file_service.httpx.AsyncClient", return_value=Client()):
        assert await service._get_latest_project_version(uuid4()) == 7


@pytest.mark.asyncio
async def test_validate_project_write_version_sanitizes_upstream_conflict(db_session):
    upstream_body = "internal lock owner=user@example.test token=secret"

    class Response:
        status_code = 409
        text = upstream_body

        def raise_for_status(self):
            return None

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, _url, json):
            return Response()

    service = FileService(
        db=db_session,
        storage_provider_service=MockStorageProviderService(),
    )

    with patch("src.services.files.file_service.httpx.AsyncClient", return_value=Client()):
        with pytest.raises(ProjectVersionLockedError) as exc_info:
            await service._validate_project_write_version(uuid4(), 3)

    message = str(exc_info.value)
    assert "Project version cannot be modified" in message
    assert "correlation_id=" in message
    assert "internal lock owner" not in message
    assert "secret" not in message


@pytest.mark.asyncio
async def test_confirm_upload_success(service):
    project_id = uuid4()
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="signed-upload.pdf",
    )
    _mock_storage_for_confirm(service)

    result = await service.confirm_upload(file_data=upload_request)

    assert isinstance(result, File)
    assert result.type == FileTypeEnum.DOCUMENT
    assert result.filename == "signed-upload.pdf"
    assert result.project_id == project_id
    assert result.mime_type == "application/pdf"


@pytest.mark.asyncio
async def test_confirm_upload_uses_explicit_project_version(service):
    project_id = uuid4()
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="versioned-upload.pdf",
    )
    _mock_storage_for_confirm(service)

    result = await service.confirm_upload(file_data=upload_request, project_version=3)

    assert isinstance(result, File)
    assert result.project_version == 3
    assert result.added_in_version == 3
    service._get_latest_project_version.assert_not_awaited()
    service._validate_project_write_version.assert_awaited_once_with(project_id, 3)


@pytest.mark.asyncio
async def test_confirm_upload_resolves_omitted_project_version(service):
    project_id = uuid4()
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="latest-version-upload.pdf",
    )
    service._get_latest_project_version = AsyncMock(return_value=4)
    _mock_storage_for_confirm(service)

    result = await service.confirm_upload(file_data=upload_request)

    assert isinstance(result, File)
    assert result.project_version == 4
    assert result.added_in_version == 4
    service._get_latest_project_version.assert_awaited_once_with(project_id)
    service._validate_project_write_version.assert_awaited_once_with(project_id, 4)


@pytest.mark.asyncio
async def test_confirm_upload_rejects_project_version_when_write_validation_fails(service):
    project_id = uuid4()
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="locked-upload.pdf",
    )
    service._validate_project_write_version = AsyncMock(side_effect=ProjectVersionLockedError(str(project_id)))

    with pytest.raises(ProjectVersionLockedError):
        await service.confirm_upload(file_data=upload_request, project_version=3)

    service._validate_project_write_version.assert_awaited_once_with(project_id, 3)
    service.storage_provider_service._mock_exists.assert_not_awaited()


@pytest.mark.asyncio
async def test_confirm_upload_file_not_found(service):
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=uuid4(),
        filename="missing.pdf",
    )

    service.storage_provider_service.document_exists = AsyncMock(return_value=False)

    with pytest.raises(FileNotFoundError):
        await service.confirm_upload(file_data=upload_request)


@pytest.mark.asyncio
async def test_confirm_upload_zip_sets_pending_status(service):
    project_id = uuid4()
    upload_request = ProjectZipUpload(
        type="zip",
        project_id=project_id,
        filename="archive.zip",
    )

    service.storage_provider_service.document_exists = AsyncMock(return_value=True)
    service.storage_provider_service.get_file_mime_type = AsyncMock(return_value="application/zip")
    service.storage_provider_service.download_document_as_file_obj = AsyncMock(
        return_value=BytesIO(b"mock_zip_content")
    )

    created = await service.confirm_upload(file_data=upload_request)

    assert isinstance(created, ZipFile)
    assert created.workflow_status == WorkflowStatusEnum.PENDING


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("upload_request", "file_type"),
    [
        pytest.param(
            ProjectZipUpload(
                type="zip",
                project_id=uuid4(),
                filename="archive.zip",
            ),
            FileTypeEnum.ZIP,
            id="regular-zip",
        ),
        pytest.param(
            EwmsZipUpload(
                type="ewms_zip",
                project_id=uuid4(),
                filename="archive.zip",
            ),
            FileTypeEnum.EWMS_ZIP,
            id="ewms-zip",
        ),
    ],
)
async def test_confirm_upload_zip_reuses_filename_with_next_zip_path(service, upload_request, file_type):
    existing = ZipFile(
        project_id=upload_request.project_id,
        filename=upload_request.filename,
        type=file_type,
        bucket_path=service._get_object_path(
            filename=upload_request.filename,
            context=upload_request,
            version=1,
        ),
    )
    service.db.add(existing)
    await service.db.commit()

    service.storage_provider_service.document_exists = AsyncMock(return_value=True)
    service.storage_provider_service.get_file_mime_type = AsyncMock(return_value="application/zip")

    created = await service.confirm_upload(file_data=upload_request)

    assert isinstance(created, ZipFile)
    assert created.bucket_path == service._get_object_path(
        filename=upload_request.filename,
        context=upload_request,
        version=2,
    )


@pytest.mark.asyncio
async def test_ingest_zip_entry_document_is_idempotent_for_same_zip_source(service):
    project_id = uuid4()
    source_zip_file_id = uuid4()
    source_zip_file = ZipFile(
        id=source_zip_file_id,
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(source_zip_file)
    await service.db.flush()

    await service.storage_provider_service.upload_document_from_obj(
        document_name="path/folder/doc.pdf",
        file_obj=BytesIO(b"test"),
        mime_type="application/pdf",
    )

    first = await service.ingest_zip_entry_document(
        source_zip_file_id=source_zip_file_id,
        project_id=project_id,
        project_version=1,
        filename="folder/doc.pdf",
        bucket_path="path/folder/doc.pdf",
    )
    second = await service.ingest_zip_entry_document(
        source_zip_file_id=source_zip_file_id,
        project_id=project_id,
        project_version=1,
        filename="folder/doc.pdf",
        bucket_path="path/folder/doc.pdf",
    )

    assert first.id == second.id
    assert first.version == 1
    assert second.version == 1
    assert service.storage_provider_service._mock_upload.call_count == 1


@pytest.mark.asyncio
async def test_ingest_zip_entry_document_is_idempotent_for_same_ewms_zip_source(service):
    project_id = uuid4()
    source_zip_file_id = uuid4()
    source_zip_file = ZipFile(
        id=source_zip_file_id,
        type=FileTypeEnum.EWMS_ZIP,
        project_id=project_id,
        filename="ewms.zip",
        bucket_path="ewms/archive.zip",
    )
    service.db.add(source_zip_file)
    await service.db.flush()

    await service.storage_provider_service.upload_document_from_obj(
        document_name="tmp/ewms/E1234.pdf",
        file_obj=BytesIO(b"test"),
        mime_type="application/pdf",
    )

    first = await service.ingest_zip_entry_document(
        source_zip_file_id=source_zip_file_id,
        project_id=project_id,
        project_version=1,
        filename="E1234.pdf",
        bucket_path="tmp/ewms/E1234.pdf",
        file_type=FileTypeEnum.EWMS_DOCUMENT,
    )
    second = await service.ingest_zip_entry_document(
        source_zip_file_id=source_zip_file_id,
        project_id=project_id,
        project_version=1,
        filename="E1234.pdf",
        bucket_path="tmp/ewms/E1234.pdf",
        file_type=FileTypeEnum.EWMS_DOCUMENT,
    )

    assert first.id == second.id
    assert first.type == FileTypeEnum.EWMS_DOCUMENT
    assert first.version == 1
    assert second.version == 1
    assert service.storage_provider_service._mock_upload.call_count == 1


@pytest.mark.asyncio
async def test_ingest_zip_entry_document_appends_ewms_same_filename_without_deleting_old_active(service):
    project_id = uuid4()
    first_zip_id = uuid4()
    second_zip_id = uuid4()
    service.db.add_all(
        [
            ZipFile(
                id=first_zip_id,
                type=FileTypeEnum.EWMS_ZIP,
                project_id=project_id,
                filename="first.zip",
                bucket_path="ewms/first.zip",
            ),
            ZipFile(
                id=second_zip_id,
                type=FileTypeEnum.EWMS_ZIP,
                project_id=project_id,
                filename="second.zip",
                bucket_path="ewms/second.zip",
            ),
        ]
    )
    await service.db.flush()

    await service.storage_provider_service.upload_document_from_obj(
        document_name="tmp/ewms/first/E1234.pdf",
        file_obj=BytesIO(b"first"),
        mime_type="application/pdf",
    )
    await service.storage_provider_service.upload_document_from_obj(
        document_name="tmp/ewms/second/E1234.pdf",
        file_obj=BytesIO(b"second"),
        mime_type="application/pdf",
    )

    first = await service.ingest_zip_entry_document(
        source_zip_file_id=first_zip_id,
        project_id=project_id,
        project_version=1,
        filename="E1234.pdf",
        bucket_path="tmp/ewms/first/E1234.pdf",
        file_type=FileTypeEnum.EWMS_DOCUMENT,
    )
    second = await service.ingest_zip_entry_document(
        source_zip_file_id=second_zip_id,
        project_id=project_id,
        project_version=1,
        filename="E1234.pdf",
        bucket_path="tmp/ewms/second/E1234.pdf",
        file_type=FileTypeEnum.EWMS_DOCUMENT,
    )

    await service.db.refresh(first)
    await service.db.refresh(second)
    assert first.is_deleted is False
    assert second.is_deleted is False
    assert first.version == 1
    assert second.version == 2


@pytest.mark.asyncio
async def test_ingest_zip_entry_document_creates_new_version_and_deletes_old_active(
    service,
):
    project_id = uuid4()
    source_zip_file_id = uuid4()
    source_zip_file = ZipFile(
        id=source_zip_file_id,
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(source_zip_file)
    await service.db.flush()

    # Create a v1 file via confirm_upload
    _mock_storage_for_confirm(service)
    current = await service.confirm_upload(
        file_data=ProjectDocumentUpload(
            type="document",
            project_id=project_id,
            filename="folder/contract.pdf",
            create_new_version=False,
        )
    )
    assert current.version == 1
    assert current.is_deleted is False

    await service.storage_provider_service.upload_document_from_obj(
        document_name="path/folder/doc.pdf",
        file_obj=BytesIO(b"test"),
        mime_type="application/pdf",
    )

    created = await service.ingest_zip_entry_document(
        source_zip_file_id=source_zip_file_id,
        project_id=project_id,
        project_version=1,
        filename="folder/contract.pdf",
        bucket_path="path/folder/contract.pdf",
    )

    assert created.version == 2
    assert created.is_deleted is False
    assert created.source_zip_file_id == source_zip_file_id

    current_refreshed = await service.get_file(
        file_id=current.id,
        include_deleted=True,
    )
    assert current_refreshed is not None
    assert current_refreshed.is_deleted is True


@pytest.mark.asyncio
async def test_get_existing_file(service):
    file = File(
        type=FileTypeEnum.DOCUMENT,
        filename="test.pdf",
        mime_type="application/pdf",
        bucket_path="documents/123/test.pdf",
        project_id=uuid4(),
    )
    service.db.add(file)
    await service.db.flush()
    await service.db.refresh(file)

    retrieved = await service.get_file(file_id=file.id)

    assert retrieved is not None
    assert retrieved.id == file.id
    assert retrieved.filename == "test.pdf"
    assert retrieved.type == FileTypeEnum.DOCUMENT
    assert retrieved.bucket_path == "documents/123/test.pdf"
    assert retrieved.project_id == file.project_id
    assert retrieved.topics == []


@pytest.mark.asyncio
async def test_get_file_without_project_version_does_not_return_historical_when_latest_missing(service):
    project_id = uuid4()
    file_id = uuid4()
    service._get_latest_project_version = AsyncMock(return_value=2)
    service.db.add(
        File(
            id=file_id,
            type=FileTypeEnum.DOCUMENT,
            filename="deleted-by-version.pdf",
            mime_type="application/pdf",
            bucket_path="documents/v1/deleted-by-version.pdf",
            project_id=project_id,
            project_version=1,
        )
    )
    await service.db.commit()

    assert await service.get_file(file_id=file_id) is None
    service._get_latest_project_version.assert_awaited_once_with(project_id)


@pytest.mark.asyncio
async def test_list_files_filtered(service):
    project_id = uuid4()
    file_id = uuid4()
    topic_id = uuid4()
    subtopic_id = uuid4()
    files = [
        File(
            id=file_id,
            type=FileTypeEnum.DOCUMENT,
            filename="a.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="v1/documents/123/a.pdf",
            topics=[FileTopic(topic_id=topic_id, file_id=file_id, project_id=project_id)],
        ),
        File(
            type=FileTypeEnum.DOCUMENT,
            filename="subtopic.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="v1/documents/123/subtopic.pdf",
            topics=[FileTopic(subtopic_id=subtopic_id, project_id=project_id)],
        ),
        File(
            type=FileTypeEnum.DOCUMENT,
            filename="b.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="v1/documents/123/b.pdf",
        ),
        File(
            type=FileTypeEnum.TEMPLATE,
            filename="123/template.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="v1/documents/123/template.pdf",
        ),
        File(
            type=FileTypeEnum.TEMPLATE,
            filename="456/template.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="v1/documents/456/template.pdf",
        ),
    ]
    service.db.add_all(files)
    await service.db.commit()

    result = await service.list_files(
        file_type=FileTypeEnum.DOCUMENT,
        project_id=project_id,
        topic_ids=[topic_id],
        name="a",
        path="/123/",
        page=1,
        page_size=10,
    )

    assert len(result) == 1
    assert result[0].filename == "a.pdf"

    subtopic_result = await service.list_files(
        file_type=FileTypeEnum.DOCUMENT,
        project_id=project_id,
        topic_ids=[subtopic_id],
        page=1,
        page_size=10,
    )

    assert len(subtopic_result) == 1
    assert subtopic_result[0].filename == "subtopic.pdf"


@pytest.mark.asyncio
async def test_list_files_resolves_project_version_when_omitted(service):
    project_id = uuid4()
    file_id = uuid4()
    service._get_latest_project_version = AsyncMock(return_value=2)
    service.db.add_all(
        [
            File(
                id=file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="v1.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/v1.pdf",
            ),
            File(
                id=file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="v2.pdf",
                project_id=project_id,
                project_version=2,
                mime_type="application/pdf",
                bucket_path="documents/v2.pdf",
            ),
        ]
    )
    await service.db.commit()

    result = await service.list_files(
        file_type=FileTypeEnum.DOCUMENT,
        project_id=project_id,
    )

    assert [file.project_version for file in result] == [2]
    assert result[0].filename == "v2.pdf"
    service._get_latest_project_version.assert_awaited_once_with(project_id)


@pytest.mark.asyncio
async def test_commit_zip_diff_copies_file_topics_without_copying_trigger_zip(service):
    project_id = uuid4()
    source_zip_id = uuid4()
    upload_zip_id = uuid4()
    file_id = uuid4()
    file_topic_id = uuid4()
    topic_id = uuid4()
    summary_id = uuid4()

    service.db.add_all(
        [
            ZipFile(
                id=source_zip_id,
                project_id=project_id,
                project_version=1,
                filename="source.zip",
                bucket_path="zips/source.zip",
                source_project_version=1,
            ),
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=1,
                filename="upload.zip",
                bucket_path="zips/upload.zip",
                source_project_version=1,
            ),
            File(
                id=file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="unchanged.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/unchanged.pdf",
                source_zip_file_id=source_zip_id,
            ),
            FileTopic(
                id=file_topic_id,
                file_id=file_id,
                topic_id=topic_id,
                project_id=project_id,
                project_version=1,
            ),
            File(
                id=summary_id,
                type=FileTypeEnum.CONTENT_EXTRACTION,
                filename="summary.json",
                project_id=project_id,
                project_version=1,
                mime_type="application/json",
                bucket_path="content_extraction/summary.json",
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(file_id),
                computed_kind=ZipDiffKind.UNCHANGED,
                decision_kind=ZipDiffKind.UNCHANGED,
                file_id=file_id,
                filename="unchanged.pdf",
                sha="same-sha",
            ),
        ]
    )
    await service.db.commit()

    result = await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )

    assert result["unchanged"] == 1
    copied_file = await service.get_file(file_id=file_id, project_version=2)
    assert copied_file is not None
    assert copied_file.source_zip_file_id is None
    assert [topic.topic_id for topic in copied_file.topics] == [topic_id]
    assert await service.get_file(file_id=summary_id, project_version=2) is not None

    copied_source_zip = await service.db.get(ZipFile, (source_zip_id, 2))
    copied_upload_zip = await service.db.get(ZipFile, (upload_zip_id, 2))
    assert copied_source_zip is None
    assert copied_upload_zip is None


@pytest.mark.asyncio
async def test_commit_zip_diff_copies_processed_json_for_unchanged_documents(service):
    project_id = uuid4()
    source_zip_id = uuid4()
    upload_zip_id = uuid4()
    doc_id = uuid4()
    processed_id = uuid4()
    unrelated_processed_id = uuid4()

    service.db.add_all(
        [
            ZipFile(
                id=source_zip_id,
                project_id=project_id,
                project_version=1,
                filename="source.zip",
                bucket_path="zips/source.zip",
                source_project_version=1,
            ),
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=1,
                filename="upload.zip",
                bucket_path="zips/upload.zip",
                source_project_version=1,
            ),
            File(
                id=doc_id,
                type=FileTypeEnum.DOCUMENT,
                filename="folder/unchanged.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/folder/unchanged.pdf",
                source_zip_file_id=source_zip_id,
            ),
            File(
                id=processed_id,
                type=FileTypeEnum.CONTENT_EXTRACTION,
                filename="folder/unchanged/unchanged_processed.json",
                project_id=project_id,
                project_version=1,
                mime_type="application/json",
                bucket_path="content_extraction/folder/unchanged/unchanged_processed.json",
            ),
            File(
                id=unrelated_processed_id,
                type=FileTypeEnum.CONTENT_EXTRACTION,
                filename="folder/other/other_processed.json",
                project_id=project_id,
                project_version=1,
                mime_type="application/json",
                bucket_path="content_extraction/folder/other/other_processed.json",
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(doc_id),
                computed_kind=ZipDiffKind.UNCHANGED,
                decision_kind=ZipDiffKind.UNCHANGED,
                file_id=doc_id,
                filename="folder/unchanged.pdf",
                sha="same-sha",
            ),
        ]
    )
    await service.db.commit()

    await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )

    copied_processed = await service.get_file(file_id=processed_id, project_version=2)
    assert copied_processed is not None
    assert copied_processed.filename == "folder/unchanged/unchanged_processed.json"
    # Only the unchanged document's _processed.json should be carried forward,
    # not unrelated content_extraction files.
    assert await service.get_file(file_id=unrelated_processed_id, project_version=2) is None


@pytest.mark.asyncio
async def test_commit_zip_diff_copies_and_renames_processed_json_for_renamed_documents(service):
    project_id = uuid4()
    source_zip_id = uuid4()
    upload_zip_id = uuid4()
    doc_id = uuid4()
    processed_id = uuid4()

    service.db.add_all(
        [
            ZipFile(
                id=source_zip_id,
                project_id=project_id,
                project_version=1,
                filename="source.zip",
                bucket_path="zips/source.zip",
                source_project_version=1,
            ),
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=1,
                filename="upload.zip",
                bucket_path="zips/upload.zip",
                source_project_version=1,
            ),
            File(
                id=doc_id,
                type=FileTypeEnum.DOCUMENT,
                filename="folder/old_name.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/folder/old_name.pdf",
                source_zip_file_id=source_zip_id,
            ),
            File(
                id=processed_id,
                type=FileTypeEnum.CONTENT_EXTRACTION,
                filename="folder/old_name/old_name_processed.json",
                project_id=project_id,
                project_version=1,
                mime_type="application/json",
                bucket_path="content_extraction/folder/old_name/old_name_processed.json",
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(doc_id),
                computed_kind=ZipDiffKind.RENAMED,
                decision_kind=ZipDiffKind.RENAMED,
                file_id=doc_id,
                filename="folder/old_name.pdf",
                old_name="folder/old_name.pdf",
                new_name="folder/new_name.pdf",
                sha="same-sha",
            ),
        ]
    )
    await service.db.commit()

    await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )

    # Renamed document file at target version uses new filename
    renamed_doc = await service.get_file(file_id=doc_id, project_version=2)
    assert renamed_doc is not None
    assert renamed_doc.filename == "folder/new_name.pdf"

    # Its _processed.json is carried forward AND renamed to match the new
    # filename pattern, so downstream consumers reconstructing the artefact
    # path from the current DOCUMENT filename still find it.
    copied_processed = await service.get_file(file_id=processed_id, project_version=2)
    assert copied_processed is not None
    assert copied_processed.filename == "folder/new_name/new_name_processed.json"


@pytest.mark.asyncio
async def test_commit_zip_diff_changed_entry_is_idempotent_on_retry(service):
    project_id = uuid4()
    source_zip_id = uuid4()
    upload_zip_id = uuid4()
    file_id = uuid4()

    await service.storage_provider_service.upload_document_from_obj(
        document_name="tmp/changed.pdf",
        file_obj=BytesIO(b"changed"),
        mime_type="application/pdf",
    )
    service.db.add_all(
        [
            ZipFile(
                id=source_zip_id,
                project_id=project_id,
                project_version=1,
                filename="source.zip",
                bucket_path="zips/source.zip",
                source_project_version=1,
            ),
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=1,
                filename="upload.zip",
                bucket_path="zips/upload.zip",
                source_project_version=1,
            ),
            File(
                id=file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="changed.pdf",
                project_id=project_id,
                project_version=1,
                version=1,
                mime_type="application/pdf",
                bucket_path="documents/v1/changed.pdf",
                source_zip_file_id=source_zip_id,
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(file_id),
                computed_kind=ZipDiffKind.CHANGED,
                decision_kind=ZipDiffKind.CHANGED,
                file_id=file_id,
                filename="changed.pdf",
                bucket_path="tmp/changed.pdf",
                source_sha="old-sha",
                target_sha="new-sha",
            ),
        ]
    )
    await service.db.commit()

    await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )
    first = await service.get_file(file_id=file_id, project_version=2)
    assert first is not None
    first_bucket_path = first.bucket_path
    assert first.version == 2
    assert first.source_zip_file_id is None

    await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )
    second = await service.get_file(file_id=file_id, project_version=2)

    assert second is not None
    assert second.version == 2
    assert second.bucket_path == first_bucket_path
    assert second.source_zip_file_id is None


@pytest.mark.asyncio
async def test_commit_zip_diff_reads_diff_from_source_version(service):
    project_id = uuid4()
    upload_zip_id = uuid4()
    file_id = uuid4()

    service.db.add_all(
        [
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=1,
                filename="upload.zip",
                bucket_path="zips/source-upload.zip",
                source_project_version=1,
            ),
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=2,
                filename="upload.zip",
                bucket_path="zips/target-upload.zip",
                source_project_version=1,
            ),
            File(
                id=file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="source-only-diff.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/source-only-diff.pdf",
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(file_id),
                computed_kind=ZipDiffKind.UNCHANGED,
                decision_kind=ZipDiffKind.UNCHANGED,
                file_id=file_id,
                filename="source-only-diff.pdf",
                sha="same-sha",
            ),
        ]
    )
    await service.db.commit()

    result = await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )

    assert result["unchanged"] == 1
    assert await service.get_file(file_id=file_id, project_version=2) is not None


@pytest.mark.asyncio
async def test_commit_zip_diff_applies_in_place_renames_and_deletes(service):
    project_id = uuid4()
    upload_zip_id = uuid4()
    renamed_file_id = uuid4()
    deleted_file_id = uuid4()

    service.db.add_all(
        [
            ZipFile(
                id=upload_zip_id,
                project_id=project_id,
                project_version=1,
                filename="upload.zip",
                bucket_path="zips/upload.zip",
                source_project_version=1,
            ),
            File(
                id=renamed_file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="old-name.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/old-name.pdf",
            ),
            File(
                id=deleted_file_id,
                type=FileTypeEnum.DOCUMENT,
                filename="deleted.pdf",
                project_id=project_id,
                project_version=1,
                mime_type="application/pdf",
                bucket_path="documents/deleted.pdf",
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(renamed_file_id),
                computed_kind=ZipDiffKind.RENAMED,
                decision_kind=ZipDiffKind.RENAMED,
                file_id=renamed_file_id,
                filename="new-name.pdf",
                old_name="old-name.pdf",
                new_name="new-name.pdf",
                sha="same-sha",
            ),
            ZipFileDiffEntry(
                zip_file_id=upload_zip_id,
                project_version=1,
                entry_key=str(deleted_file_id),
                computed_kind=ZipDiffKind.DELETED,
                decision_kind=ZipDiffKind.DELETED,
                file_id=deleted_file_id,
                filename="deleted.pdf",
                sha="deleted-sha",
            ),
        ]
    )
    await service.db.commit()

    await service.commit_zip_diff(
        zip_file_id=upload_zip_id,
        project_id=project_id,
        source_version=1,
        target_version=1,
        dry_run=False,
    )

    renamed = await service.get_file(file_id=renamed_file_id, project_version=1)
    deleted = await service.get_file(file_id=deleted_file_id, project_version=1, include_deleted=True)

    assert renamed is not None
    assert renamed.filename == "new-name.pdf"
    assert deleted is not None
    assert deleted.is_deleted is True


@pytest.mark.asyncio
async def test_clean_up_deletes_old_temporal_checkpoints(service):
    project_id = uuid.uuid4()
    workflow_id = "wf-12345"
    run_id = "run-abc"

    old_date = datetime.now(UTC) - timedelta(days=15)
    recent_date = datetime.now(UTC) - timedelta(days=1)

    file1 = File(
        type=FileTypeEnum.TEMPORAL_CHECKPOINT,
        filename="checkpoint1.json",
        mime_type="application/json",
        bucket_path=f"temporal_checkpoints/{workflow_id}/{run_id}/1.json",
        project_id=project_id,
        workflow_id=workflow_id,
        run_id=run_id,
        created_at=old_date,
    )
    file2 = File(
        type=FileTypeEnum.TEMPORAL_CHECKPOINT,
        filename="checkpoint2.json",
        mime_type="application/json",
        bucket_path=f"temporal_checkpoints/{workflow_id}/{run_id}/2.json",
        project_id=project_id,
        workflow_id=workflow_id,
        run_id=run_id,
        created_at=old_date,
    )
    recent_file = File(
        type=FileTypeEnum.TEMPORAL_CHECKPOINT,
        filename="recent.json",
        mime_type="application/json",
        bucket_path="temporal_checkpoints/recent.json",
        project_id=project_id,
        workflow_id="wf-new",
        run_id="run-new",
        created_at=recent_date,
    )

    service.db.add_all([file1, file2, recent_file])
    await service.db.flush()
    await service.db.commit()

    with patch.object(service.storage_provider_service, "delete_document", new_callable=AsyncMock) as mock_delete:
        deleted_ids = await service.clean_up(
            retention_days=14,
            file_type=FileTypeEnum.TEMPORAL_CHECKPOINT,
        )

    # Should delete only the 2 old ones
    assert len(deleted_ids) == 2
    assert set(deleted_ids) == {str(file1.id), str(file2.id)}

    # Storage delete called for both
    assert mock_delete.call_count == 2

    # Recent file still exists
    count = await service.db.scalar(select(func.count()).select_from(File).where(File.id == recent_file.id))
    assert count == 1

    # Old files gone
    count = await service.db.scalar(select(func.count()).select_from(File).where(File.id.in_([file1.id, file2.id])))
    assert count == 0


@pytest.mark.asyncio
async def test_list_files_excludes_deleted(service):
    """Test that list_files does not return soft-deleted files."""
    project_id = uuid4()
    files = [
        File(
            type=FileTypeEnum.DOCUMENT,
            filename="active.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="documents/123/active.pdf",
            is_deleted=False,
        ),
        File(
            type=FileTypeEnum.DOCUMENT,
            filename="deleted.pdf",
            project_id=project_id,
            mime_type="application/pdf",
            bucket_path="documents/123/deleted.pdf",
            is_deleted=True,
        ),
    ]
    service.db.add_all(files)
    await service.db.commit()
    result = await service.list_files(
        file_type=FileTypeEnum.DOCUMENT,
        project_id=project_id,
    )
    assert len(result) == 1
    assert result[0].filename == "active.pdf"


@pytest.mark.asyncio
async def test_delete_file_soft_deletes(service):
    """Test that delete_file marks the file as deleted instead of removing it."""
    project_id = uuid4()
    file = File(
        type=FileTypeEnum.DOCUMENT,
        filename="to_delete.pdf",
        mime_type="application/pdf",
        bucket_path="documents/123/to_delete.pdf",
        project_id=project_id,
        is_deleted=False,
    )
    service.db.add(file)
    await service.db.flush()
    await service.db.refresh(file)
    file_id = file.id

    deleted_file = await service.delete_file(file_id=file_id, project_version=1)
    assert deleted_file is not None
    assert deleted_file.is_deleted is True
    count = await service.db.scalar(select(func.count()).select_from(File).where(File.id == file_id))
    assert count == 1
    retrieved = await service.get_file(file_id=file_id)
    assert retrieved is None
    retrieved = await service.get_file(file_id=file_id, include_deleted=True)
    assert retrieved.id == file_id


@pytest.mark.asyncio
async def test_confirm_upload_first_version_is_1(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    result = await service.confirm_upload(
        file_data=ProjectDocumentUpload(
            type="document",
            project_id=project_id,
            filename="new_file.pdf",
        )
    )

    assert result.version == 1
    assert "v1" in result.bucket_path


@pytest.mark.asyncio
async def test_versioning_temporal_checkpoint(service):
    project_id = uuid4()
    wf_id = uuid4()
    run_id = uuid4()
    _mock_storage_for_confirm(service)

    file_data = TemporalCheckpointUpload(
        type="temporal_checkpoint",
        project_id=project_id,
        filename="versioned.pdf",
        create_new_version=True,
        workflow_id=str(wf_id),
        run_id=str(run_id),
    )

    v1_file = await service.confirm_upload(file_data=file_data)
    v1_id = v1_file.id
    assert v1_file.version == 1
    assert v1_file.is_deleted is False

    # Same run_id should create v2
    v2_file = await service.confirm_upload(file_data=file_data)
    assert v2_file.version == 2
    assert v2_file.is_deleted is False
    assert v2_file.id != v1_id

    # Other run_id should create new version
    file_data.run_id = str(uuid4())
    v1_other = await service.confirm_upload(file_data=file_data)
    assert v1_other.version == 1
    assert v1_other.is_deleted is False


@pytest.mark.asyncio
async def test_versioning_temporal_checkpoint_no_project_id(service):
    wf_id = uuid4()
    run_id = uuid4()
    _mock_storage_for_confirm(service)

    file_data = TemporalCheckpointUpload(
        type="temporal_checkpoint",
        project_id=uuid4(),
        filename="versioned.pdf",
        create_new_version=True,
        workflow_id=str(wf_id),
        run_id=str(run_id),
    )

    v1_file = await service.confirm_upload(file_data=file_data)
    v1_id = v1_file.id
    assert v1_file.version == 1
    assert v1_file.is_deleted is False

    # Same run_id should create v2
    v2_file = await service.confirm_upload(file_data=file_data)
    assert v2_file.version == 2
    assert v2_file.is_deleted is False
    assert v2_file.id != v1_id

    # Other run_id should create new version
    file_data.run_id = str(uuid4())
    v1_other = await service.confirm_upload(file_data=file_data)
    assert v1_other.version == 1
    assert v1_other.is_deleted is False


@pytest.mark.asyncio
async def test_confirm_upload_increments_version_and_marks_old_deleted(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    file_data = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="versioned.pdf",
        create_new_version=True,
    )

    v1_file = await service.confirm_upload(file_data=file_data)
    v1_id = v1_file.id
    assert v1_file.version == 1
    assert v1_file.is_deleted is False

    v2_file = await service.confirm_upload(file_data=file_data)
    assert v2_file.version == 2
    assert v2_file.is_deleted is False
    assert v2_file.id != v1_id

    old_file = await service.get_file(file_id=v1_id, include_deleted=True)
    assert old_file is not None
    assert old_file.is_deleted is True


@pytest.mark.asyncio
async def test_confirm_upload_raises_on_conflict(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    file_data = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="versioned.pdf",
        create_new_version=False,
    )

    v1_file = await service.confirm_upload(file_data=file_data)
    assert v1_file.version == 1
    assert v1_file.is_deleted is False

    with pytest.raises(FileExistsError):
        await service.confirm_upload(file_data=file_data)


@pytest.mark.asyncio
async def test_version_continues_after_deleted_file(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    file_data = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="continuing.pdf",
        create_new_version=True,
    )

    # Create v1 and v2
    v1 = await service.confirm_upload(file_data=file_data)
    assert v1.version == 1

    v2 = await service.confirm_upload(file_data=file_data)
    assert v2.version == 2

    # Now v1 is deleted, v2 is active. Create v3
    v3 = await service.confirm_upload(file_data=file_data)
    assert v3.version == 3

    # Verify v2 is now deleted
    v2_refreshed = await service.get_file(file_id=v2.id, include_deleted=True)
    assert v2_refreshed.is_deleted is True


@pytest.mark.asyncio
async def test_same_filename_different_projects_independent_versions(service):
    project_a = uuid4()
    project_b = uuid4()
    _mock_storage_for_confirm(service)

    file_a = await service.confirm_upload(
        file_data=ProjectDocumentUpload(
            type="document",
            project_id=project_a,
            filename="shared_name.pdf",
        )
    )

    file_b = await service.confirm_upload(
        file_data=ProjectDocumentUpload(
            type="document",
            project_id=project_b,
            filename="shared_name.pdf",
        )
    )

    # Both should be version 1 (independent)
    assert file_a.version == 1
    assert file_b.version == 1
    assert file_a.is_deleted is False
    assert file_b.is_deleted is False


@pytest.mark.asyncio
async def test_get_versions(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    upload_data = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="duplicate.pdf",
        create_new_version=True,
    )

    file_1 = await service.confirm_upload(file_data=upload_data)
    file_2 = await service.confirm_upload(file_data=upload_data)

    file_list = await service.get_versions(file_id=file_1.id)
    assert len(file_list) == 2
    # Ordered desc
    assert file_list[0].version == 2
    assert file_list[1].version == 1
    # IDs
    assert file_list[0].id == file_2.id
    assert file_list[1].id == file_1.id


@pytest.mark.asyncio
async def test_generate_download_url_deleted(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    upload_data = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="duplicate.pdf",
        create_new_version=True,
    )

    file_1 = await service.confirm_upload(file_data=upload_data)
    await service.confirm_upload(file_data=upload_data)
    model, url = await service.generate_download_url(
        file_id=file_1.id,
        include_deleted=True,
    )
    assert model.id == file_1.id
    assert url is not None


@pytest.mark.asyncio
async def test_generate_download_url_deleted_raises(service):
    project_id = uuid4()
    _mock_storage_for_confirm(service)

    upload_data = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="duplicate.pdf",
        create_new_version=True,
    )

    file_1 = await service.confirm_upload(file_data=upload_data)
    await service.confirm_upload(file_data=upload_data)
    with pytest.raises(FileNotFoundError):
        await service.generate_download_url(
            file_id=file_1.id,
            include_deleted=False,
        )


async def _add_downloadable_file(
    service,
    *,
    workflow_status: WorkflowStatusEnum | None,
) -> File:
    project_id = uuid4()
    file_id = uuid4()
    bucket_path = f"{project_id}/v1/download.pdf"
    service.storage_provider_service._documents[service.storage_provider_service._get_blob_name(bucket_path)] = (
        b"mock_content"
    )
    file = File(
        id=file_id,
        type=FileTypeEnum.DOCUMENT,
        filename="download.pdf",
        mime_type="application/pdf",
        bucket_path=bucket_path,
        project_id=project_id,
        project_version=1,
        workflow_status=workflow_status,
    )
    service.db.add(file)
    await service.db.commit()
    return file


@pytest.mark.asyncio
async def test_generate_download_url_blocks_pending_validation(service):
    file = await _add_downloadable_file(service, workflow_status=WorkflowStatusEnum.PENDING)

    with pytest.raises(WorkflowInPendingStateError):
        await service.generate_download_url(file_id=file.id, project_version=file.project_version)


@pytest.mark.asyncio
async def test_generate_download_url_allows_completed_validation(service):
    file = await _add_downloadable_file(service, workflow_status=WorkflowStatusEnum.COMPLETED)

    model, url = await service.generate_download_url(file_id=file.id, project_version=file.project_version)

    assert model.id == file.id
    assert url is not None


@pytest.mark.asyncio
async def test_generate_download_url_allows_legacy_or_internal_null_status(service):
    file = await _add_downloadable_file(service, workflow_status=None)

    model, url = await service.generate_download_url(file_id=file.id, project_version=file.project_version)

    assert model.id == file.id
    assert url is not None


@pytest.mark.asyncio
async def test_update_file(service):
    project_id = uuid4()
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="signed-upload.pdf",
    )
    _mock_storage_for_confirm(service)

    result = await service.confirm_upload(file_data=upload_request)

    new_topic_ids = [uuid4(), uuid4()]
    update_result = await service.update_file(
        file_id=result.id,
        update_data=FileUpdateRequest(
            topics=new_topic_ids,
            mime_type="application/custom",
        ),
    )
    assert isinstance(update_result, File)
    topics = await update_result.awaitable_attrs.topics
    topic_ids = [topic.topic_id for topic in topics]
    assert sorted(topic_ids) == sorted(new_topic_ids)
    assert update_result.mime_type == "application/custom"


@pytest.mark.asyncio
async def test_update_file_validates_project_write_version(service):
    project_id = uuid4()
    upload_request = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="locked-update.pdf",
    )
    _mock_storage_for_confirm(service)
    created = await service.confirm_upload(file_data=upload_request, project_version=2)
    service._validate_project_write_version.reset_mock()
    service._validate_project_write_version.side_effect = ProjectVersionLockedError(str(project_id))

    with pytest.raises(ProjectVersionLockedError):
        await service.update_file(
            file_id=created.id,
            update_data=FileUpdateRequest(mime_type="application/blocked"),
            project_version=2,
        )

    service._validate_project_write_version.assert_awaited_once_with(project_id, 2)
    await service.db.refresh(created)
    assert created.mime_type == "application/pdf"


@pytest.mark.asyncio
async def test_start_file_processing_zip_success(service):
    """Test starting a Temporal workflow for a zip upload."""
    project_id = uuid4()
    zip_file = ZipFile(
        filename="archive.zip",
        bucket_path=f"zips/{project_id}/v1/archive.zip",
        project_id=project_id,
        workflow_status=WorkflowStatusEnum.FAILED,
    )
    service.db.add(zip_file)
    await service.db.flush()

    payload = StartFileProcessingRequest(
        file_id=zip_file.id,
        project_id=project_id,
    )
    service._get_latest_project_version = AsyncMock(return_value=1)
    result = await service.start_file_processing(payload)

    assert isinstance(result, StartFileProcessingResponse)
    assert result.workflow_id == f"FileProcessingWorkflow-{project_id}"
    assert result.workflow_status == WorkflowStatusEnum.REQUIRES_APPROVAL


@pytest.mark.asyncio
async def test_start_file_processing_file_not_found(service):
    """Test FileNotFoundError when neither zip nor file exists."""
    payload = StartFileProcessingRequest(
        file_id=uuid4(),
        project_id=uuid4(),
    )

    with pytest.raises(FileNotFoundError, match="not found"):
        await service.start_file_processing(payload)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure_mode, side_effect, expected_msg",
    [
        pytest.param(
            "client_failure",
            RuntimeError("temporal unavailable"),
            "temporal unavailable",
            id="get_client",
        ),
        pytest.param(
            "start_failure",
            RuntimeError("workflow start failed"),
            "workflow start failed",
            id="start_workflow",
        ),
    ],
)
async def test_start_file_processing_failure_keeps_existing_zip_status(
    service, failure_mode, side_effect, expected_msg
):
    project_id = uuid4()
    zip_file = ZipFile(
        filename="archive.zip",
        bucket_path=f"zips/{project_id}/v1/archive.zip",
        project_id=project_id,
        workflow_status=WorkflowStatusEnum.FAILED,
    )
    service.db.add(zip_file)
    await service.db.flush()

    payload = StartFileProcessingRequest(file_id=zip_file.id, project_id=project_id)

    temporal_path = "src.services.files.file_service.start_workflow"

    service._get_latest_project_version = AsyncMock(return_value=1)
    with patch(temporal_path, new_callable=AsyncMock) as mock_start_workflow:
        mock_start_workflow.side_effect = side_effect

        with pytest.raises(RuntimeError, match=expected_msg):
            await service.start_file_processing(payload)

    await service.db.refresh(zip_file)
    assert zip_file.workflow_status == WorkflowStatusEnum.FAILED


@pytest.mark.asyncio
async def test_start_file_processing_zip_blocks_concurrent_project_workflow(service):
    project_id = uuid4()
    zip_file = ZipFile(
        filename="archive.zip",
        bucket_path=f"zips/{project_id}/v1/archive.zip",
        project_id=project_id,
        workflow_status=WorkflowStatusEnum.FAILED,
    )
    service.db.add(zip_file)
    await service.db.flush()

    payload = StartFileProcessingRequest(file_id=zip_file.id, project_id=project_id)

    temporal_path = "src.services.files.file_service.start_workflow"

    service._get_latest_project_version = AsyncMock(return_value=1)
    with patch(temporal_path, new_callable=AsyncMock) as mock_start_workflow:
        mock_start_workflow.side_effect = WorkflowAlreadyStartedError(
            f"FileProcessingWorkflow-{project_id}",
            "FileProcessingWorkflow",
            run_id="existing-run",
        )

        with pytest.raises(WorkflowInRunningStateError, match="already running"):
            await service.start_file_processing(payload)

    mock_start_workflow.assert_awaited_once()
    call_kwargs = mock_start_workflow.await_args.kwargs
    assert call_kwargs["_ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID"] == (
        f"FileProcessingWorkflow-{project_id}"
    )
    assert call_kwargs["id_reuse_policy"] == WorkflowIDReusePolicy.ALLOW_DUPLICATE
    assert call_kwargs["id_conflict_policy"] == WorkflowIDConflictPolicy.FAIL

    await service.db.refresh(zip_file)
    assert zip_file.workflow_status == WorkflowStatusEnum.FAILED


@pytest.mark.asyncio
@patch("src.services.files.file_service.settings")
async def test_start_file_processing_single_file_success(mock_settings, service):
    """Test starting a Temporal workflow for a single (non-zip) file."""
    mock_settings.CLAMAV.ENABLED = True

    project_id = uuid4()
    file = File(
        type=FileTypeEnum.DOCUMENT,
        filename="report.pdf",
        mime_type="application/pdf",
        bucket_path=f"documents/{project_id}/v1/report.pdf",
        project_id=project_id,
    )
    service.db.add(file)
    await service.db.flush()

    payload = StartFileProcessingRequest(
        file_id=file.id,
        project_id=project_id,
    )
    result = await service.start_file_processing(payload)

    assert isinstance(result, StartFileProcessingResponse)
    assert result.workflow_id == str(file.id)
    assert result.workflow_status == WorkflowStatusEnum.REQUIRES_APPROVAL


@pytest.mark.asyncio
async def test_update_file_status_activity_updates_zip_row(service):
    project_id = uuid4()
    zip_file_id = uuid4()
    zip_file = ZipFile(
        id=zip_file_id,
        filename="archive.zip",
        bucket_path=f"zips/{project_id}/v1/archive.zip",
        project_id=project_id,
        project_version=1,
        workflow_status=WorkflowStatusEnum.PENDING,
    )
    copied_zip_file = ZipFile(
        id=zip_file_id,
        filename="archive.zip",
        bucket_path=f"zips/{project_id}/v2/archive.zip",
        project_id=project_id,
        project_version=2,
        workflow_status=WorkflowStatusEnum.PENDING,
    )
    service.db.add_all([zip_file, copied_zip_file])
    await service.db.flush()

    @asynccontextmanager
    async def session_override():
        yield service.db

    with patch(
        "src.services.workflows.activities.update_workflow_status.AsyncSessionLocal",
        side_effect=lambda: session_override(),
    ):
        await update_file_status(
            UpdateFileStatusInput(
                zip_file_id=str(zip_file.id),
                status=WorkflowStatusEnum.RUNNING,
            )
        )

    await service.db.refresh(zip_file)
    await service.db.refresh(copied_zip_file)
    assert zip_file.workflow_status == WorkflowStatusEnum.RUNNING
    assert copied_zip_file.workflow_status == WorkflowStatusEnum.RUNNING

    with patch(
        "src.services.workflows.activities.update_workflow_status.AsyncSessionLocal",
        side_effect=lambda: session_override(),
    ):
        await update_file_status(
            UpdateFileStatusInput(
                zip_file_id=str(zip_file.id),
                status=WorkflowStatusEnum.TERMINATED,
            )
        )

    await service.db.refresh(zip_file)
    await service.db.refresh(copied_zip_file)
    assert zip_file.workflow_status == WorkflowStatusEnum.TERMINATED
    assert copied_zip_file.workflow_status == WorkflowStatusEnum.TERMINATED
