from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, call

import pytest
from botocore.exceptions import ClientError

from src.services.storage_provider.storage_provider_s3_service import (
    AsyncS3StorageClient,
)


class TestS3DocumentService:
    @pytest.fixture
    def s3_service(self):
        """
        Fixture for AsyncS3StorageClient with mocked aioboto3 backend.
        """
        service = AsyncS3StorageClient(
            bucket_name="my-bucket",
            doc_store_path="integration_tests",
            endpoint_url="http://mock-s3:9000",
            access_key="test",
            secret_key="test",
            region="us-east-1",
        )

        # Mock long-lived clients
        service._private_client = AsyncMock()
        service._public_client = AsyncMock()

        yield service

    async def test_document_exists(self, s3_service):
        key = s3_service._get_key("file.pdf")

        # Exists
        s3_service._private_client.head_object = AsyncMock()
        assert await s3_service.document_exists("file.pdf") is True
        s3_service._private_client.head_object.assert_called_once_with(Bucket="my-bucket", Key=key)

        # Does not exist (404)
        s3_service._private_client.head_object.side_effect = ClientError({"Error": {"Code": "404"}}, "HeadObject")
        assert await s3_service.document_exists("file.pdf") is False

        # Other error propagates
        s3_service._private_client.head_object.side_effect = ClientError({"Error": {"Code": "403"}}, "HeadObject")
        with pytest.raises(ClientError):
            await s3_service.document_exists("file.pdf")

    async def test_upload_and_download_document(self, s3_service):
        document_name = "test.pdf"
        key = s3_service._get_key(document_name)
        content = b"hello world"

        # Upload: file does not exist
        s3_service.document_exists = AsyncMock(return_value=False)
        s3_service._private_client.upload_fileobj = AsyncMock()

        file_obj = BytesIO(content)
        await s3_service.upload_document_from_obj(
            document_name=document_name,
            file_obj=file_obj,
            mime_type="text/plain",
        )

        s3_service.document_exists.assert_called_once_with(document_name)
        s3_service._private_client.upload_fileobj.assert_called_once()
        call_args = s3_service._private_client.upload_fileobj.call_args
        assert call_args[1]["Bucket"] == "my-bucket"
        assert call_args[1]["Key"] == key
        assert call_args[1]["ExtraArgs"]["ContentType"] == "text/plain"

        # Download
        s3_service.document_exists.reset_mock()
        s3_service.document_exists.return_value = True

        # Mock download to simulate content
        async def fake_download(**kwargs):
            kwargs["Fileobj"].write(content)
            kwargs["Fileobj"].seek(0)

        s3_service._private_client.download_fileobj = AsyncMock(side_effect=fake_download)

        bio = await s3_service.download_document_as_file_obj(document_name)
        assert bio.read() == content
        s3_service._private_client.download_fileobj.assert_called_once_with(Bucket="my-bucket", Key=key, Fileobj=bio)

    async def test_delete_document(self, s3_service):
        document_name = "file.pdf"
        key = s3_service._get_key(document_name)

        s3_service.document_exists = AsyncMock(return_value=True)
        s3_service._private_client.delete_object = AsyncMock()

        await s3_service.delete_document(document_name)

        s3_service.document_exists.assert_called_once_with(document_name)
        s3_service._private_client.delete_object.assert_called_once_with(Bucket="my-bucket", Key=key)

    async def test_delete_document_not_found(self, s3_service):
        s3_service.document_exists = AsyncMock(return_value=False)

        with pytest.raises(FileNotFoundError):
            await s3_service.delete_document("missing.pdf")

        s3_service._private_client.delete_object.assert_not_called()

    async def test_list_all_documents(self, s3_service):
        class FakePaginator:
            async def paginate(self, *args, **kwargs):
                yield {
                    "Contents": [
                        {"Key": "integration_tests/path/file1.pdf"},
                        {"Key": "integration_tests/path/file2.pdf"},
                    ]
                }

        mock_paginator = FakePaginator()
        s3_service._private_client.get_paginator = MagicMock(return_value=mock_paginator)

        files = await s3_service.list_all_documents()

        assert files == ["file1.pdf", "file2.pdf"]

    async def test_generate_upload_signed_url(self, s3_service):
        document_name = "file.pdf"
        key = s3_service._get_key(document_name)
        expected_url = "https://mock-s3/upload/signed"

        s3_service.document_exists = AsyncMock(return_value=False)
        s3_service._public_client.generate_presigned_url = AsyncMock(return_value=expected_url)

        url = await s3_service.generate_upload_signed_url(
            document_name=document_name,
            expiration_minutes=10,
            mime_type="application/pdf",
        )

        assert url == expected_url
        s3_service._public_client.generate_presigned_url.assert_called_once_with(
            "put_object",
            Params={
                "Bucket": "my-bucket",
                "Key": key,
                "ContentType": "application/pdf",
            },
            ExpiresIn=600,
        )

    async def test_generate_upload_signed_url_internal(self, s3_service):
        document_name = "file.pdf"
        key = s3_service._get_key(document_name)
        expected_url = "http://internal-s3/upload/signed"

        s3_service.document_exists = AsyncMock(return_value=False)
        s3_service._private_client.generate_presigned_url = AsyncMock(return_value=expected_url)
        s3_service._public_client.generate_presigned_url = AsyncMock()

        url = await s3_service.generate_upload_signed_url(
            document_name=document_name,
            expiration_minutes=10,
            mime_type="application/pdf",
            internal=True,
        )

        assert url == expected_url
        s3_service._private_client.generate_presigned_url.assert_called_once_with(
            "put_object",
            Params={
                "Bucket": "my-bucket",
                "Key": key,
                "ContentType": "application/pdf",
            },
            ExpiresIn=600,
        )
        s3_service._public_client.generate_presigned_url.assert_not_called()

    async def test_generate_upload_signed_url_file_exists(self, s3_service):
        s3_service.document_exists = AsyncMock(return_value=True)
        with pytest.raises(FileExistsError):
            await s3_service.generate_upload_signed_url("file.pdf")

    async def test_generate_download_signed_url(self, s3_service):
        document_name = "file.pdf"
        key = s3_service._get_key(document_name)
        expected_url = "https://mock-s3/download/signed"

        s3_service.document_exists = AsyncMock(return_value=True)
        s3_service._public_client.generate_presigned_url = AsyncMock(return_value=expected_url)

        url = await s3_service.generate_download_signed_url(
            document_name=document_name,
            expiration_minutes=10,
            mime_type="application/pdf",
            inline=True,
        )

        assert url == expected_url
        s3_service._public_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={
                "Bucket": "my-bucket",
                "Key": key,
                "ResponseContentDisposition": 'inline; filename="file.pdf"',
                "ResponseContentType": "application/pdf",
            },
            ExpiresIn=600,
        )

    async def test_copy_document_success(self, s3_service):
        source_name = "old/document-v1.pdf"
        dest_name = "new/document-v2.pdf"

        src_key = s3_service._get_key(source_name)
        dst_key = s3_service._get_key(dest_name)

        s3_service.document_exists = AsyncMock(side_effect=[False, True])  # dest no, source yes
        s3_service._private_client.copy_object = AsyncMock()

        await s3_service.copy_document(source_name=source_name, destination_name=dest_name, overwrite=False)

        s3_service.document_exists.assert_has_calls(
            [
                call(dest_name),
                call(source_name),
            ]
        )
        s3_service._private_client.copy_object.assert_called_once_with(
            Bucket="my-bucket",
            Key=dst_key,
            CopySource=f"my-bucket/{src_key}",
        )

    async def test_copy_document_overwrite_false_destination_exists(self, s3_service):
        s3_service.document_exists = AsyncMock(side_effect=[True, True])
        s3_service._private_client.copy_object = AsyncMock()

        with pytest.raises(FileExistsError):
            await s3_service.copy_document("source.pdf", "dest.pdf", overwrite=False)

        s3_service._private_client.copy_object.assert_not_called()

    async def test_copy_document_overwrite_true(self, s3_service):
        s3_service.document_exists = AsyncMock(side_effect=[True])  # only source check
        s3_service._private_client.copy_object = AsyncMock()

        await s3_service.copy_document("source.pdf", "dest.pdf", overwrite=True)

        assert s3_service.document_exists.call_count == 1  # only source
        s3_service._private_client.copy_object.assert_called_once()

    async def test_copy_document_source_not_found(self, s3_service):
        s3_service.document_exists = AsyncMock(side_effect=[False, False])
        s3_service._private_client.copy_object = AsyncMock()

        with pytest.raises(FileNotFoundError):
            await s3_service.copy_document("missing.pdf", "dest.pdf")

        s3_service._private_client.copy_object.assert_not_called()
