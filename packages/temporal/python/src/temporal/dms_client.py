import json
import logging
from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

import httpx

from temporal.contracts import DMSFileResponse
from temporal.project_context import current_project_context

logger = logging.getLogger("temporal.dms_client")

FileId = str | UUID

DEFAULT_TIMEOUT_SECONDS = 120.0
DEFAULT_PAGE_SIZE = 500
DEFAULT_MAX_PAGES = 200
DEFAULT_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=20)

_HTTP_NOT_FOUND = 404
_HTTP_CONFLICT = 409
_JSON_HEADERS = {"Content-Type": "application/json"}


class DmsConflictError(RuntimeError):
    pass


def with_project_version_params(params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    context = current_project_context()
    if context is None:
        return params

    updated_params = dict(params or {})
    updated_params.setdefault("projectVersion", context.project_version)
    return updated_params


def json_default(obj: Any) -> Any:
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def serialize_json(value: Any) -> str:
    return json.dumps(value, default=json_default)


def encode_upload_payload(payload: Any) -> bytes | str:
    if isinstance(payload, bytes | str):
        return payload
    if isinstance(payload, bytearray | memoryview):
        return bytes(payload)
    return serialize_json(payload)


def _not_found(file_id: FileId) -> FileNotFoundError:
    return FileNotFoundError(f"DMS file not found: {file_id}")


class DmsClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        limits: httpx.Limits = DEFAULT_LIMITS,
        page_size: int = DEFAULT_PAGE_SIZE,
        max_pages: int = DEFAULT_MAX_PAGES,
        http_client: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.limits = limits
        self.page_size = page_size
        self.max_pages = max_pages
        self.headers: dict[str, str] = dict(_JSON_HEADERS)
        self._http_client = http_client

    @asynccontextmanager
    async def _session(self) -> AsyncGenerator[httpx.AsyncClient]:
        if self._http_client is not None:
            yield self._http_client()
            return
        async with httpx.AsyncClient(timeout=self.timeout, limits=self.limits) as client:
            yield client

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: Any = None,
        file_id: FileId | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        async with self._session() as client:
            if method == "GET":
                resp = await client.get(url, params=params, headers=self.headers)
            elif method == "POST":
                resp = await client.post(url, params=params, content=serialize_json(body), headers=self.headers)
            else:
                raise ValueError(f"Unsupported DMS request method: {method}")
            if file_id is not None and resp.status_code == _HTTP_NOT_FOUND:
                raise _not_found(file_id)
            resp.raise_for_status()
            return resp.json()

    async def list_files_page(
        self,
        project_id: FileId,
        file_type: str = "document",
        page: int = 1,
        page_size: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "projectId": str(project_id),
            "pageSize": page_size or self.page_size,
            "includeDeleted": False,
            "fileType": file_type,
            "page": page,
        }
        return await self._request("GET", "/v2/files", params=with_project_version_params(params))

    async def list_file_records(self, project_id: FileId, file_type: str = "document") -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        page = 1
        while page <= self.max_pages:
            data = await self.list_files_page(project_id, file_type, page=page)
            if not data:
                break
            records.extend(data)
            if len(data) < self.page_size:
                break
            page += 1
        return records

    async def list_files(self, project_id: str, file_type: str = "document") -> list[DMSFileResponse]:
        return [DMSFileResponse(**item) for item in await self.list_file_records(project_id, file_type)]

    async def list_documents_with_extractions(self, project_id: str) -> list[tuple[DMSFileResponse, str]]:
        docs = await self.list_files(project_id, file_type="document")
        extraction_docs = await self.list_files(project_id, file_type="content_extraction")
        ext_map = {d.filename: d.id for d in extraction_docs}
        pairs: list[tuple[DMSFileResponse, str]] = []
        for doc in docs:
            base_path = doc.filename.rsplit(".", 1)[0]
            file_name = base_path.split("/")[-1]
            target_path = f"{base_path}/{file_name}_processed.json"
            if target_path in ext_map:
                pairs.append((doc, ext_map[target_path]))
            else:
                logger.error("Missing Inhaltsextraction _processed.json for %s. File Id: %s", doc.filename, doc.id)
        return pairs

    async def get_file_metadata(self, file_id: FileId) -> dict[str, Any]:
        return await self._request(
            "GET",
            f"/v2/files/{file_id}",
            params=with_project_version_params(),
            file_id=file_id,
        )

    async def get_download_url(self, file_id: FileId) -> str:
        data = await self._request(
            "GET",
            f"/v2/internal/files/{file_id}/generate-download-url",
            params=with_project_version_params(),
            file_id=file_id,
        )
        return data["downloadUrl"]

    async def download_bytes(self, file_id: FileId) -> bytes:
        download_url = await self.get_download_url(file_id)
        async with self._session() as client:
            resp = await client.get(download_url)
            if resp.status_code == _HTTP_NOT_FOUND:
                raise _not_found(file_id)
            resp.raise_for_status()
            return resp.content

    async def download_json(self, file_id: FileId) -> Any:
        return json.loads(await self.download_bytes(file_id))

    async def delete_file(self, file_id: FileId) -> None:
        async with self._session() as client:
            resp = await client.delete(
                f"{self.base_url}/v2/files/{file_id}",
                params=with_project_version_params(),
                headers=self.headers,
            )
            if resp.status_code != _HTTP_NOT_FOUND:
                resp.raise_for_status()

    async def upload_content(
        self,
        project_id: FileId,
        filename: str,
        content: bytes | str,
        *,
        file_type: str = "document",
        content_type: str | None = None,
        extra_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = {
            "filename": filename,
            "projectId": project_id,
            "type": file_type,
            "createNewVersion": True,
            **(extra_params or {}),
        }
        size_mb = len(content) / (1024 * 1024)
        try:
            meta = await self._request(
                "POST",
                "/v2/internal/files/generate-upload-url",
                params=with_project_version_params(),
                body=body,
            )
            upload_content_type = content_type or str(meta.get("mimeType", "application/json"))
            async with self._session() as client:
                resp = await client.put(
                    meta["uploadUrl"],
                    content=content,
                    headers={"Content-Type": upload_content_type},
                )
                resp.raise_for_status()
            return await self._request(
                "POST",
                "/v2/internal/files/confirm-upload",
                params=with_project_version_params(),
                body=body,
            )
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            if isinstance(exc, httpx.HTTPStatusError):
                logger.error(
                    "DMS upload error for '%s': %s - %s", filename, exc.response.status_code, exc.response.text
                )
                if exc.response.status_code == _HTTP_CONFLICT:
                    raise DmsConflictError(f"File already exists in DMS: '{filename}'") from None
            raise RuntimeError(
                f"DMS upload failed for '{filename}' ({size_mb:.1f} MB): {type(exc).__name__}: {exc}"
            ) from None

    async def upload_file(
        self,
        project_id: str,
        filename: str,
        payload: Any,
        file_type: str = "document",
        extra_params: dict[str, Any] | None = None,
    ) -> DMSFileResponse:
        data = await self.upload_content(
            project_id,
            filename,
            encode_upload_payload(payload),
            file_type=file_type,
            extra_params=extra_params,
        )
        return DMSFileResponse(**data)

    async def upload_temporal_checkpoint(
        self,
        project_id: str,
        workflow_id: str,
        run_id: str,
        filename: str,
        payload: Any,
    ) -> DMSFileResponse:
        return await self.upload_file(
            project_id=project_id,
            filename=filename,
            payload=payload,
            file_type="temporal_checkpoint",
            extra_params={"workflowId": workflow_id, "runId": run_id},
        )
