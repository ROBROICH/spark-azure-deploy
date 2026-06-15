from collections.abc import AsyncIterator
from io import BytesIO
from typing import Any, BinaryIO
from unittest.mock import AsyncMock

from temporalio.client import WorkflowHandle

from src.models.db.workflow_enum import WorkflowStatusEnum
from src.services.storage_provider.storage_provider_base_service import (
    BaseStorageProviderService,
)


class MockWorkflowHandle(WorkflowHandle):
    """Minimal WorkflowHandle for FileService unit tests."""

    def __init__(self, workflow_id: str, run_id: str = "mock-run-id"):
        self._workflow_id = workflow_id
        self._run_id = run_id

    @property
    def id(self) -> str:
        return self._workflow_id

    @property
    def run_id(self) -> str:
        return self._run_id

    async def cancel(self, *_args: object, **_kwargs: object) -> None:
        return None

    async def describe(self, *_args: object, **_kwargs: object) -> Any:
        class MockDescription:
            status = type("Status", (), {"name": WorkflowStatusEnum.REQUIRES_APPROVAL.name})
            run_id = self.run_id

        return MockDescription()


class MockStorageProviderService(BaseStorageProviderService):
    """
    Async mock for BaseStorageProviderService.

    Simulates cloud storage in-memory for tests.
    All public methods are async to match the real async implementations.
    """

    def __init__(
        self,
        bucket_name: str = "test-bucket",
        doc_store_path: str = "document_store",
        **_,
    ):
        super().__init__(
            bucket_name=bucket_name,
            doc_store_path=doc_store_path,
        )
        # In-memory storage: {full_blob_name: bytes}
        self._documents: dict[str, bytes] = {
            f"{self.doc_store_path}/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380010/v1/test_file.pdf": b"mock_content",
        }

        # Mocked async methods (for advanced test spying if needed)
        self._mock_exists = AsyncMock()
        self._mock_upload = AsyncMock()
        self._mock_download = AsyncMock()
        self._mock_delete = AsyncMock()
        self._mock_signed_url = AsyncMock()
        self._mock_stream = AsyncMock()
        self._mock_get_metadata = AsyncMock()
        self._mock_update_metadata = AsyncMock()

        self._metadata: dict[str, dict[str, str]] = {}

    def initialize(self) -> None:
        pass

    def close(self) -> None:
        pass

    def bucket_exists(self) -> bool:
        return True

    def _get_blob_name(self, document_name: str) -> str:
        """Internal helper: full blob path."""
        return f"{self.doc_store_path.rstrip('/')}/{document_name.lstrip('/')}"

    async def document_exists(self, document_name: str) -> bool:
        blob_name = self._get_blob_name(document_name)
        exists = blob_name in self._documents
        await self._mock_exists(blob_name, exists)
        return exists

    async def get_file_mime_type(self, document_name: str) -> str | None:
        if await self.document_exists(document_name):
            # Simulate MIME from extension or fixed
            return "application/pdf"
        return None

    async def delete_document(self, document_name: str) -> None:
        blob_name = self._get_blob_name(document_name)
        if blob_name not in self._documents:
            raise FileNotFoundError(f"Document '{document_name}' not found")
        del self._documents[blob_name]
        await self._mock_delete(blob_name)

    async def copy_document(
        self,
        source_name: str,
        destination_name: str,
        overwrite: bool = False,
    ) -> None:
        src_blob = self._get_blob_name(source_name)
        dst_blob = self._get_blob_name(destination_name)

        if src_blob not in self._documents:
            raise FileNotFoundError(f"Source '{source_name}' not found")

        if not overwrite and dst_blob in self._documents:
            raise FileExistsError(f"Destination '{destination_name}' already exists")

        self._documents[dst_blob] = self._documents[src_blob]

    async def upload_document_from_obj(
        self,
        document_name: str,
        file_obj: BinaryIO,
        overwrite: bool = False,
        mime_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> None:
        blob_name = self._get_blob_name(document_name)

        if not overwrite and blob_name in self._documents:
            raise FileExistsError(f"Document '{document_name}' already exists")

        file_obj.seek(0)
        content = file_obj.read()
        self._documents[blob_name] = content
        await self._mock_upload(blob_name, len(content), mime_type)

    async def download_document_as_file_obj(self, document_name: str) -> BytesIO:
        blob_name = self._get_blob_name(document_name)
        if blob_name not in self._documents:
            raise FileNotFoundError(f"Document '{document_name}' not found")

        bio = BytesIO(self._documents[blob_name])
        bio.seek(0)
        await self._mock_download(blob_name, len(self._documents[blob_name]))
        return bio

    async def list_all_documents(
        self,
        path: bool = False,
        prefix: str | None = None,
    ) -> list[str]:
        prefix_str = self._get_blob_name(prefix or "").rstrip("/")
        files = []

        for blob_name in self._documents:
            if blob_name.startswith(prefix_str):
                rel_path = blob_name[len(self.doc_store_path.rstrip("/") + "/") :].lstrip("/")
                if path:
                    files.append(rel_path)
                else:
                    files.append(rel_path.split("/")[-1])

        return files

    async def generate_upload_signed_url(
        self,
        document_name: str,
        expiration_minutes: int = 15,
        mime_type: str | None = None,
    ) -> str:
        if await self.document_exists(document_name):
            raise FileExistsError(f"Document '{document_name}' already exists")

        url = f"https://mock-storage.example.com/upload/{self._get_blob_name(document_name)}"
        await self._mock_signed_url(
            "upload",
            document_name,
            expiration_minutes,
            mime_type,
        )
        return url

    async def generate_download_signed_url(
        self,
        document_name: str,
        expiration_minutes: int = 15,
        mime_type: str | None = None,
        inline: bool = False,
    ) -> str:
        if not await self.document_exists(document_name):
            raise FileNotFoundError(f"Document '{document_name}' not found")

        disposition = f'inline; filename="{document_name}"' if inline else f'attachment; filename="{document_name}"'
        url = (
            f"https://mock-storage.example.com/download/{self._get_blob_name(document_name)}?disposition={disposition}"
        )
        await self._mock_signed_url(
            "download",
            document_name,
            expiration_minutes,
            mime_type,
            inline,
        )
        return url

    async def download_document_stream(
        self,
        document_name: str,
        chunk_size: int = 256 * 1024,
    ) -> AsyncIterator[bytes]:
        blob_name = self._get_blob_name(document_name)

        if blob_name not in self._documents:
            raise FileNotFoundError(f"Document '{document_name}' not found")

        content = self._documents[blob_name]
        self._mock_stream(blob_name, len(content), chunk_size)

        # Simple chunked streaming simulation
        pos = 0
        while pos < len(content):
            end = min(pos + chunk_size, len(content))
            yield content[pos:end]
            pos = end

    async def get_metadata(
        self,
        document_name: str,
        keys: list[str] | str | None = None,
        default: Any = None,
    ) -> dict[str, str]:
        blob_name = self._get_blob_name(document_name)

        if blob_name not in self._documents:
            raise FileNotFoundError(f"Document '{document_name}' not found")

        meta = self._metadata.get(blob_name, {})

        self._mock_get_metadata(blob_name, keys)

        # Handle different calling patterns
        if keys is None:
            return meta.copy()

        # list[str] case
        result = {}
        for k in keys:
            if k in meta:
                result[k] = meta[k]
            elif default is not None:
                result[k] = default
        return result

    async def update_metadata(
        self,
        document_name: str,
        metadata: dict[str, str],
        overwrite_existing: bool = True,
        preserve_existing_keys: bool = True,
    ) -> None:
        blob_name = self._get_blob_name(document_name)

        if blob_name not in self._documents:
            raise FileNotFoundError(f"Document '{document_name}' not found")

        current = self._metadata.get(blob_name, {})

        if not overwrite_existing:
            for k, v in metadata.items():
                if k in current and current[k] != v:
                    raise ValueError(
                        f"Metadata key '{k}' already exists with different value (old: {current[k]!r}, new: {v!r})"
                    )

        if preserve_existing_keys:
            new_meta = current.copy()
            new_meta.update(metadata)
        else:
            new_meta = metadata.copy()

        self._metadata[blob_name] = new_meta
        self._mock_update_metadata(
            blob_name,
            metadata,
            overwrite_existing=overwrite_existing,
            preserve_existing_keys=preserve_existing_keys,
        )

    def _set_mock_metadata(self, document_name: str, metadata: dict[str, str]) -> None:
        """Convenience method for test setup — not part of real interface"""
        blob_name = self._get_blob_name(document_name)
        if blob_name in self._documents:
            self._metadata[blob_name] = metadata.copy()
