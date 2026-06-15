"""Unit tests for virus scanning in extract_zip activity."""

import zipfile
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.db.workflow_enum import ErrorCode
from src.services.virus_scan import VirusScanResult
from src.services.workflows.activities.activity_models import ExtractZipInput
from src.services.workflows.activities.activity_utils import S3Context
from src.services.workflows.activities.extract_zip import extract_zip


def _make_zip_bytes(entries: dict[str, bytes]) -> bytes:
    """Create a ZIP file in memory with the given entries."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


@pytest.fixture
def activity_input():
    return ExtractZipInput(
        zip_file_id=str(uuid4()),
        filename="test.zip",
        project_id=str(uuid4()),
        zip_path="zips/test.zip",
    )


@pytest.fixture
def mock_fs():
    """Mock s3fs filesystem that returns a ZIP with two PDF entries."""
    zip_bytes = _make_zip_bytes(
        {
            "doc1.pdf": b"%PDF-1.4 clean content",
            "doc2.pdf": b"%PDF-1.4 also clean",
        }
    )

    fs = MagicMock()
    fs.open.return_value.__enter__ = MagicMock(return_value=BytesIO(zip_bytes))
    fs.open.return_value.__exit__ = MagicMock(return_value=False)
    fs.rm = MagicMock()
    return fs


@pytest.mark.asyncio
@patch("src.services.workflows.activities.extract_zip.create_file_service")
@patch("src.services.workflows.activities.extract_zip.get_s3_context")
@patch("src.services.workflows.activities.extract_zip.scan_bytes")
async def test_extract_zip_clean_entries(mock_scan, mock_get_s3_context, mock_create_service, activity_input, mock_fs):
    """All entries clean → all results successful."""
    mock_scan.return_value = VirusScanResult(is_clean=True)
    mock_get_s3_context.return_value = S3Context(fs=mock_fs, path="bucket/dms_data/zips/test.zip")

    mock_storage = AsyncMock()
    mock_storage.document_exists = AsyncMock(return_value=False)
    mock_storage.compute_sha256 = AsyncMock(return_value="abc123")
    mock_storage.upload_document_from_obj = AsyncMock()

    mock_service = AsyncMock()
    mock_service.storage_provider_service = mock_storage

    mock_create_service.return_value.__aenter__ = AsyncMock(return_value=mock_service)
    mock_create_service.return_value.__aexit__ = AsyncMock(return_value=False)

    # Patch AsyncSessionLocal and create_file_service properly
    with patch("src.services.workflows.activities.extract_zip.AsyncSessionLocal") as mock_session:
        mock_db = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_create_service.return_value = mock_service

        results = await extract_zip(activity_input)

    assert len(results) == 2
    assert all(r.success for r in results)
    assert mock_scan.await_count == 2
    assert [r.bucket_path for r in results] == [
        f"tmp/{activity_input.project_id}/{activity_input.zip_file_id}/doc1.pdf",
        f"tmp/{activity_input.project_id}/{activity_input.zip_file_id}/doc2.pdf",
    ]
    mock_storage.document_exists.assert_not_awaited()
    assert mock_storage.upload_document_from_obj.await_args_list[0].kwargs["document_name"] == results[0].bucket_path
    assert mock_storage.upload_document_from_obj.await_args_list[0].kwargs["overwrite"] is True
    assert mock_storage.upload_document_from_obj.await_args_list[1].kwargs["document_name"] == results[1].bucket_path
    assert mock_storage.upload_document_from_obj.await_args_list[1].kwargs["overwrite"] is True


@pytest.mark.asyncio
@patch("src.services.workflows.activities.extract_zip.create_file_service")
@patch("src.services.workflows.activities.extract_zip.get_s3_context")
@patch("src.services.workflows.activities.extract_zip.scan_bytes")
async def test_extract_zip_infected_entry(mock_scan, mock_get_s3_context, mock_create_service, activity_input):
    """One infected entry → marked as VIRUS_DETECTED, other succeeds."""
    zip_bytes = _make_zip_bytes(
        {
            "clean.pdf": b"%PDF-1.4 clean",
            "infected.pdf": b"%PDF-1.4 evil",
        }
    )

    fs = MagicMock()
    fs.open.return_value.__enter__ = MagicMock(return_value=BytesIO(zip_bytes))
    fs.open.return_value.__exit__ = MagicMock(return_value=False)
    fs.rm = MagicMock()
    mock_get_s3_context.return_value = S3Context(fs=fs, path="bucket/dms_data/zips/test.zip")

    # First call clean, second call infected
    mock_scan.side_effect = [
        VirusScanResult(is_clean=True),
        VirusScanResult(is_clean=False, threat_name="TestVirus"),
    ]

    mock_storage = AsyncMock()
    mock_storage.document_exists = AsyncMock(return_value=False)
    mock_storage.compute_sha256 = AsyncMock(return_value="abc123")
    mock_storage.upload_document_from_obj = AsyncMock()

    mock_service = AsyncMock()
    mock_service.storage_provider_service = mock_storage

    with patch("src.services.workflows.activities.extract_zip.AsyncSessionLocal") as mock_session:
        mock_db = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_create_service.return_value = mock_service

        results = await extract_zip(activity_input)

    successful = [r for r in results if r.success]
    failed = [r for r in results if not r.success]
    assert len(successful) == 1
    assert len(failed) == 1
    assert failed[0].error_code == ErrorCode.VIRUS_DETECTED
    assert "TestVirus" in failed[0].error_message


@pytest.mark.asyncio
@patch("src.services.workflows.activities.extract_zip.create_file_service")
@patch("src.services.workflows.activities.extract_zip.get_s3_context")
@patch("src.services.workflows.activities.extract_zip.scan_bytes")
async def test_extract_zip_allows_only_pdf_entries_without_filename_policy(
    mock_scan, mock_get_s3_context, mock_create_service, activity_input
):
    zip_bytes = _make_zip_bytes(
        {
            "contains-invalid-files/ABC-S8689_8243804475-typed.pdf": b"%PDF-1.4 clean",
            "contains-invalid-files/S8689.png": b"not a pdf",
            "contains-invalid-files/S8689.jpg": b"not a pdf",
            "contains-invalid-files/S8689.docx": b"not a pdf",
            "contains-invalid-files/Z8689_8243804475-typed.pdf": b"%PDF-1.4 clean",
        }
    )

    fs = MagicMock()
    fs.open.return_value.__enter__ = MagicMock(return_value=BytesIO(zip_bytes))
    fs.open.return_value.__exit__ = MagicMock(return_value=False)
    fs.rm = MagicMock()
    mock_get_s3_context.return_value = S3Context(fs=fs, path="bucket/dms_data/zips/test.zip")
    mock_scan.return_value = VirusScanResult(is_clean=True)

    mock_storage = AsyncMock()
    mock_storage.document_exists = AsyncMock(return_value=False)
    mock_storage.compute_sha256 = AsyncMock(return_value="abc123")
    mock_storage.upload_document_from_obj = AsyncMock()

    mock_service = AsyncMock()
    mock_service.storage_provider_service = mock_storage

    with patch("src.services.workflows.activities.extract_zip.AsyncSessionLocal") as mock_session:
        mock_db = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_create_service.return_value = mock_service

        results = await extract_zip(activity_input)

    successful = [result for result in results if result.success]
    failed = {result.filename: result for result in results if not result.success}

    assert [result.filename for result in successful] == [
        "contains-invalid-files/ABC-S8689_8243804475-typed.pdf",
        "contains-invalid-files/Z8689_8243804475-typed.pdf",
    ]
    assert set(failed) == {
        "contains-invalid-files/S8689.docx",
        "contains-invalid-files/S8689.jpg",
        "contains-invalid-files/S8689.png",
    }
    assert all(result.error_code == ErrorCode.UNSUPPORTED_FILETYPE for result in failed.values())
    assert "not supported" in (failed["contains-invalid-files/S8689.png"].error_message or "")
    assert mock_scan.await_count == 2
    assert mock_storage.upload_document_from_obj.await_count == 2
