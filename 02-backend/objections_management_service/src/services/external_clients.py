"""Small HTTP clients for objection-service downstream integrations."""

from collections.abc import Awaitable
from http import HTTPStatus
from uuid import UUID

import httpx
from authentification.internal_api_key import internal_api_key_headers
from node_crud.exceptions import ProjectVersionLockedError
from pydantic import AliasChoices, BaseModel, Field

from src.config.settings import settings
from src.exceptions.exceptions import ExternalServiceError


class DmsFileMetadata(BaseModel):
    id: UUID
    type: str
    filename: str
    project_version: int = Field(
        default=1,
        validation_alias=AliasChoices("projectVersion", "project_version"),
    )
    project_id: UUID | None = Field(
        default=None,
        validation_alias=AliasChoices("projectId", "project_id"),
    )


class TopicMetadata(BaseModel):
    id: UUID
    name: str
    parent_topic_id: UUID | None = Field(
        default=None,
        validation_alias=AliasChoices("parentTopicId", "parent_topic_id"),
    )


class DocumentManagementClient:
    """Client for the DMS endpoints used by Erwiderung import/export."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.base_url = (base_url or settings.DOCUMENT_MANAGEMENT_SERVICE_URL).rstrip("/")
        self.timeout = timeout or settings.EXTERNAL_SERVICE_TIMEOUT_SECONDS

    async def upload_internal_file(
        self,
        *,
        project_id: UUID,
        file_type: str,
        filename: str,
        content: bytes,
    ) -> UUID:
        payload = {
            "type": file_type,
            "filename": filename,
            "projectId": str(project_id),
            "createNewVersion": True,
        }

        service_headers = internal_api_key_headers()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            upload_url_response = await self._request(
                client.post(
                    f"{self.base_url}/v2/internal/files/generate-upload-url",
                    json=payload,
                    headers=service_headers,
                )
            )
            upload_url_payload = upload_url_response.json()
            upload_url: str = upload_url_payload["uploadUrl"]
            mime_type: str = upload_url_payload["mimeType"]

            await self._request(
                client.put(
                    upload_url,
                    content=content,
                    headers={"Content-Type": mime_type},
                ),
                service_name="signed-file-storage",
            )

            confirm_response = await self._request(
                client.post(
                    f"{self.base_url}/v2/internal/files/confirm-upload",
                    json=payload,
                    headers=service_headers,
                )
            )
            return UUID(confirm_response.json()["id"])

    async def get_file(self, file_id: UUID, *, project_version: int) -> DmsFileMetadata:
        async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
            response = await self._request(
                client.get(
                    f"{self.base_url}/v2/files/{file_id}",
                    params={"project_version": project_version},
                )
            )
            return DmsFileMetadata.model_validate(response.json())

    async def list_project_files(
        self,
        *,
        project_id: UUID,
        project_version: int,
        file_type: str,
    ) -> list[DmsFileMetadata]:
        files: list[DmsFileMetadata] = []
        page = 1
        page_size = 500

        async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
            while True:
                response = await self._request(
                    client.get(
                        f"{self.base_url}/v2/files",
                        params={
                            "file_type": file_type,
                            "projectId": str(project_id),
                            "project_version": project_version,
                            "page": page,
                            "page_size": page_size,
                        },
                    )
                )
                batch = [DmsFileMetadata.model_validate(item) for item in response.json()]
                files.extend(batch)
                if len(batch) < page_size:
                    return files
                page += 1

    async def download_file(self, file_id: UUID, *, project_version: int) -> bytes:
        service_headers = internal_api_key_headers()

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
            download_url_response = await self._request(
                client.get(
                    f"{self.base_url}/v2/files/{file_id}/generate-download-url",
                    params={"project_version": project_version},
                    headers=service_headers,
                )
            )
            download_url = download_url_response.json()["downloadUrl"]
            content_response = await self._request(
                client.get(download_url),
                service_name="signed-file-storage",
            )
            return content_response.content

    @classmethod
    async def _request(
        cls,
        response_awaitable: Awaitable[httpx.Response],
        *,
        service_name: str = "document-management-service",
    ) -> httpx.Response:
        try:
            response = await response_awaitable
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ExternalServiceError(
                service_name,
                f"{exc.response.status_code} response from {_safe_request_target(exc.request.url)}",
            ) from exc
        except httpx.RequestError as exc:
            raise ExternalServiceError(
                service_name,
                f"request to {_safe_request_target(exc.request.url)} failed",
            ) from exc
        return response


class ProjectLogicClient:
    """Client for fetching topic names from Project Logic Service."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.base_url = (base_url or settings.PROJECT_LOGIC_SERVICE_URL).rstrip("/")
        self.timeout = timeout or settings.EXTERNAL_SERVICE_TIMEOUT_SECONDS

    async def get_latest_project_version(self, project_id: UUID) -> int:
        async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
            response = await DocumentManagementClient._request(
                client.get(f"{self.base_url}/projects/{project_id}/latest-version"),
                service_name="project-logic-service",
            )
        body = response.json()
        latest_version = body.get("latest_version", body.get("latestVersion"))
        if latest_version is None:
            raise ExternalServiceError("project-logic-service", "latest-version response did not include latestVersion")
        return int(latest_version)

    async def get_project_name(self, project_id: UUID) -> str:
        async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
            response = await DocumentManagementClient._request(
                client.get(f"{self.base_url}/projects/{project_id}"),
                service_name="project-logic-service",
            )
        name = response.json().get("name")
        if not isinstance(name, str) or not name.strip():
            raise ExternalServiceError("project-logic-service", "project response did not include name")
        return name

    async def validate_project_write_version(self, project_id: UUID, project_version: int) -> int:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
                response = await client.post(
                    f"{self.base_url}/projects/{project_id}/version-lock/validate-write",
                    json={"project_version": project_version},
                )
            if response.status_code == HTTPStatus.CONFLICT:
                detail = response.json().get("detail", response.text)
                raise ProjectVersionLockedError(str(project_id), detail)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ExternalServiceError(
                "project-logic-service",
                f"{exc.response.status_code} response from {_safe_request_target(exc.request.url)}",
            ) from exc
        except httpx.RequestError as exc:
            raise ExternalServiceError(
                "project-logic-service",
                f"request to {_safe_request_target(exc.request.url)} failed",
            ) from exc
        body = response.json()
        latest_version = body.get("latest_version", body.get("latestVersion"))
        if latest_version is None:
            raise ExternalServiceError("project-logic-service", "validate-write response did not include latestVersion")
        return int(latest_version)

    async def get_topics(self, topic_ids: set[UUID]) -> dict[UUID, TopicMetadata]:
        if not topic_ids:
            return {}

        async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
            response = await DocumentManagementClient._request(
                client.post(
                    f"{self.base_url}/topics/batch",
                    json=[str(topic_id) for topic_id in topic_ids],
                ),
                service_name="project-logic-service",
            )

        topics = [TopicMetadata.model_validate(item) for item in response.json()]
        return {topic.id: topic for topic in topics}


def _safe_request_target(url: httpx.URL) -> str:
    port = f":{url.port}" if url.port is not None else ""
    return f"{url.scheme}://{url.host}{port}{url.path}"
