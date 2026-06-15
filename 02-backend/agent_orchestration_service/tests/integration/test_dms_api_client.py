"""Integration tests for DMS API client — FilesApiClient.upload_file() production path.

Run with:
    poetry run pytest tests/integration/test_dms_api_client.py -m integration -v --no-cov --memray
"""

import uuid

import httpx
import pytest

from src.config.settings import settings
from src.models.schemas.files import FileUpdateRequest, FileUploadArgs
from src.services.api_clients import ApiClient, FilesApiClient

from .conftest import seed_file

DMS_BASE_URL = settings.api.dms_base_url

pytestmark = pytest.mark.integration


async def test_download_file(pdf_content: bytes) -> None:
    """Seed a PDF into DMS, then download it via FilesApiClient.download_file()."""
    file_obj = await seed_file(pdf_content, filename="test-download.pdf")

    downloaded = await FilesApiClient.download_file(file_obj.id)
    assert downloaded.read() == pdf_content


async def test_upload_file_roundtrip(pdf_content: bytes) -> None:
    """
    This will fail when USE_TRANSFER_ENCODING_CHUNKED=true is set and
    the DMS server doesn't use Ceph (locally it uses Minio)

    This is expected, don't delete this test
    """
    # Seed the PDF so we have something to stream-download
    seeded = await seed_file(pdf_content, filename="test-seed.pdf")

    # Stream-download the seeded file to get an httpx.Response (like DiPlan would give us)
    download_resp = await ApiClient.get(f"{DMS_BASE_URL}/v2/files/{seeded.id}/generate-download-url")
    download_url = download_resp.json()["downloadUrl"]

    async with httpx.AsyncClient(timeout=60) as client, client.stream("GET", download_url) as stream_response:
        upload_args = FileUploadArgs(
            type="document",
            filename=f"reupload-{uuid.uuid4().hex[:8]}.pdf",
            project_id=str(uuid.uuid4()),
        )
        result = await FilesApiClient.upload_file(upload_args, stream_response)

    # Verify the re-uploaded file can be downloaded and matches
    downloaded = await FilesApiClient.download_file(result.id)
    assert downloaded.read() == pdf_content


async def test_update_file(pdf_content: bytes) -> None:
    """Test updating a DMS file."""
    file_obj = await seed_file(pdf_content, filename="test-download.pdf")
    expected_topics = [uuid.uuid4(), uuid.uuid4()]
    result = await FilesApiClient.update_file(
        file_id=file_obj.id, update_data=FileUpdateRequest(topics=expected_topics)
    )
    assert result.topics == expected_topics
