from io import BytesIO

import pytest

from src.services.storage_provider.storage_provider_s3_service import (
    AsyncS3StorageClient,
)

FILENAME = "test.pdf"
FILENAME2 = "test2.pdf"
FILENAME3 = "copy_test.pdf"

# Minimal valid PDF content for testing
_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj"


@pytest.fixture
async def storage_service():
    """Session-scoped storage service for all integration tests."""
    storage_provider_service = AsyncS3StorageClient(
        doc_store_path="integration_tests",
    )
    await storage_provider_service.initialize()

    # Cleanup before tests start
    test_names = [FILENAME, FILENAME2, FILENAME3]
    for name in test_names:
        if await storage_provider_service.document_exists(name):
            await storage_provider_service.delete_document(name)

    yield storage_provider_service

    # Cleanup after all tests
    for name in test_names:
        if await storage_provider_service.document_exists(name):
            await storage_provider_service.delete_document(name)

    await storage_provider_service.close()


@pytest.fixture
def pdf_file_obj():
    """Fresh BytesIO with PDF content for each test that needs it."""
    bio = BytesIO(_PDF_BYTES)
    bio.seek(0)
    yield bio
    bio.close()


@pytest.mark.asyncio
@pytest.mark.integration
class TestStorageProviderIntegration:
    """Integration tests for backed DocumentService."""

    @pytest.mark.asyncio
    async def test_upload_document_from_obj(self, storage_service, pdf_file_obj):
        """Upload a PDF from a BytesIO object."""
        await storage_service.upload_document_from_obj(
            document_name=FILENAME,
            file_obj=pdf_file_obj,
            mime_type="application/pdf",
            overwrite=True,
        )

        assert await storage_service.document_exists(FILENAME)
        mime = await storage_service.get_file_mime_type(FILENAME)
        assert mime == "application/pdf"

    @pytest.mark.asyncio
    async def test_generate_download_signed_url(self, storage_service, pdf_file_obj):
        """Generate signed download URL — requires file to exist."""
        # Make sure file exists (upload if needed)
        if not await storage_service.document_exists(FILENAME):
            pdf_file_obj.seek(0)
            await storage_service.upload_document_from_obj(
                document_name=FILENAME,
                file_obj=pdf_file_obj,
                mime_type="application/pdf",
                overwrite=True,
            )

        url = await storage_service.generate_download_signed_url(
            document_name=FILENAME,
            inline=True,
        )
        assert url.startswith(("https://", "http://"))

    @pytest.mark.asyncio
    async def test_generate_upload_signed_url(self, storage_service):
        """Generate signed upload URL for a new file."""
        url = await storage_service.generate_upload_signed_url(
            document_name=FILENAME2,
        )
        assert url.startswith(("https://", "http://"))

        # Optional: verify file does NOT exist yet
        assert not await storage_service.document_exists(FILENAME2)

    @pytest.mark.asyncio
    async def test_copy_document(self, storage_service, pdf_file_obj):
        """
        Upload → copy → verify both exist and content matches.
        """
        # Step 1: Upload source
        pdf_file_obj.seek(0)
        await storage_service.upload_document_from_obj(
            document_name=FILENAME,
            file_obj=pdf_file_obj,
            mime_type="application/pdf",
            overwrite=True,
        )
        assert await storage_service.document_exists(FILENAME)

        # Step 2: Copy
        await storage_service.copy_document(
            source_name=FILENAME,
            destination_name=FILENAME3,
            overwrite=False,
        )

        # Step 3: Verify
        assert await storage_service.document_exists(FILENAME)
        assert await storage_service.document_exists(FILENAME3)

        mime = await storage_service.get_file_mime_type(FILENAME3)
        assert mime == "application/pdf"

        original = await storage_service.download_document_as_file_obj(FILENAME)
        copied = await storage_service.download_document_as_file_obj(FILENAME3)

        assert original.read() == copied.read()

    @pytest.mark.asyncio
    async def test_delete_document(self, storage_service, pdf_file_obj):
        """Upload a file then delete it."""
        # Upload first
        pdf_file_obj.seek(0)
        await storage_service.upload_document_from_obj(
            document_name=FILENAME,
            file_obj=pdf_file_obj,
            mime_type="application/pdf",
            overwrite=True,
        )
        assert await storage_service.document_exists(FILENAME)

        # Delete
        await storage_service.delete_document(FILENAME)
        assert not await storage_service.document_exists(FILENAME)

    @pytest.mark.asyncio
    async def test_get_mime_type_after_upload(self, storage_service, pdf_file_obj):
        """Separate test for mime type retrieval."""
        pdf_file_obj.seek(0)
        await storage_service.upload_document_from_obj(
            document_name=FILENAME,
            file_obj=pdf_file_obj,
            mime_type="application/pdf",
            overwrite=True,
        )

        mime = await storage_service.get_file_mime_type(FILENAME)
        assert mime is not None
        assert mime == "application/pdf"

    @pytest.mark.asyncio
    async def test_list_documents(self, storage_service, pdf_file_obj):
        await storage_service.upload_document_from_obj(
            document_name=FILENAME,
            file_obj=pdf_file_obj,
            mime_type="application/pdf",
            overwrite=True,
        )
        result = await storage_service.list_all_documents()
        assert FILENAME in result
