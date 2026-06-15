"""Unit tests for confirm_upload with quarantine/ClamAV workflow_status handling."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.models.db.db_models import File
from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.file_schema import ProjectDocumentUpload
from src.services.files.file_service import FileService
from tests.unit.conftest import MockStorageProviderService


@pytest.fixture
def quarantine_storage():
    return MockStorageProviderService(bucket_name="quarantine-bucket")


@pytest.fixture
def clean_storage():
    return MockStorageProviderService(bucket_name="clean-bucket")


@pytest.fixture
def service(db_session, clean_storage, quarantine_storage):
    file_service = FileService(
        db=db_session,
        storage_provider_service=clean_storage,
        quarantine_storage_provider_service=quarantine_storage,
    )
    file_service._get_latest_project_version = AsyncMock(return_value=1)
    file_service._validate_project_write_version = AsyncMock(
        side_effect=lambda _project_id, project_version: project_version
    )
    return file_service


def _setup_quarantine_file(quarantine_storage, bucket_path: str):
    """Put a file in quarantine so confirm_upload finds it."""
    blob = quarantine_storage._get_blob_name(bucket_path)
    quarantine_storage._documents[blob] = b"file-content"


@pytest.mark.asyncio
@patch("src.services.files.file_service.settings")
async def test_confirm_upload_sets_pending_when_clamav_enabled(mock_settings, service, quarantine_storage):
    """When ClamAV is enabled, confirm_upload sets workflow_status=PENDING for user uploads."""
    mock_settings.CLAMAV.ENABLED = True
    mock_settings.ALLOWED_FILE_EXTENSIONS = None
    mock_settings.ALLOWED_FILE_TYPES = None

    project_id = uuid4()
    upload = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="report.pdf",
    )

    bucket_path = service._get_object_path(filename="report.pdf", context=upload, version=1)
    _setup_quarantine_file(quarantine_storage, bucket_path)

    result = await service.confirm_upload(file_data=upload)

    assert isinstance(result, File)
    assert result.filename == "report.pdf"
    assert result.workflow_status == WorkflowStatusEnum.PENDING


@pytest.mark.asyncio
@patch("src.services.files.file_service.settings")
async def test_confirm_upload_no_pending_when_clamav_disabled(mock_settings, service, quarantine_storage):
    """When ClamAV is disabled, confirm_upload does NOT set workflow_status=PENDING."""
    mock_settings.CLAMAV.ENABLED = False
    mock_settings.ALLOWED_FILE_EXTENSIONS = None
    mock_settings.ALLOWED_FILE_TYPES = None

    project_id = uuid4()
    upload = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="report.pdf",
    )

    bucket_path = service._get_object_path(filename="report.pdf", context=upload, version=1)
    # When ClamAV disabled, _get_storage_for_type returns clean storage
    blob = service.storage_provider_service._get_blob_name(bucket_path)
    service.storage_provider_service._documents[blob] = b"file-content"

    result = await service.confirm_upload(file_data=upload)

    assert isinstance(result, File)
    assert result.workflow_status is None
