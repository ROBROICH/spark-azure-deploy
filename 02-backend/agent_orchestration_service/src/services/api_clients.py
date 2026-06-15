import ssl
from collections.abc import AsyncGenerator, AsyncIterable, Mapping, Sequence
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any, Literal
from uuid import UUID

import httpx
from audit_client import merge_audit_headers
from authentification.internal_api_key import merge_internal_api_key_header
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
)
from pydantic import AliasChoices, BaseModel, Field
from temporal.project_context import current_project_context
from temporalio.exceptions import ApplicationError

from src.config.settings import settings
from src.models.schemas.ewms import ClassificationRequest, InjectionDetectedRequest
from src.models.schemas.files import FileObject, FileUpdateRequest, FileUploadArgs
from src.models.schemas.temporal.fvp import TemplateDocumentTypeResponse
from src.models.schemas.topics import TopicResponse
from src.services.project_version_errors import project_version_error_type
from src.utils.logger import logger


class NodeRef(BaseModel):
    node_type: str
    id: UUID


class AdministrativeFileDraftRisk(BaseModel):
    id: UUID
    vae_node_id: UUID = Field(validation_alias=AliasChoices("vae_node_id", "vaeNodeId"))
    status: Literal["open", "corrected", "ignored"] | None = None


ProjectInternalStatus = Literal["IN_PROGRESS"]

HTTP_CONFLICT = 409
HTTP_OK = 200


class ApiClient:
    timeout = settings.api.timeout

    def __init__(self) -> None:
        pass

    @staticmethod
    def _with_project_version(params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        context = current_project_context()
        if context is None:
            return params

        updated_params = dict(params or {})
        updated_params.setdefault("project_version", context.project_version)
        return updated_params

    @staticmethod
    def _http_error_detail(response: httpx.Response) -> str:
        try:
            body: object = response.json()
        except ValueError:
            return response.text
        if isinstance(body, dict):
            detail = body.get("detail")
            if isinstance(detail, str):
                return detail
        return response.text

    @classmethod
    def _raise_non_retryable_project_version_error(cls, exc: httpx.HTTPStatusError) -> None:
        if exc.response.status_code != HTTP_CONFLICT:
            return

        detail = cls._http_error_detail(exc.response)
        error_type = project_version_error_type(detail)
        if error_type is None:
            return

        raise ApplicationError(detail, type=error_type, non_retryable=True) from exc

    @classmethod
    async def get(
        cls,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
        include_project_version: bool = True,
        include_internal_api_key: bool = True,
    ) -> httpx.Response:
        headers = merge_audit_headers(headers)
        if include_internal_api_key:
            headers = merge_internal_api_key_header(headers)
        if include_project_version:
            params = cls._with_project_version(params)
        async with httpx.AsyncClient(timeout=cls.timeout) as client:
            try:
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    body = exc.response.json()
                except Exception:
                    body = exc.response.text
                logger.error(
                    action=EventAction.DOWNLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed GET {exc.response.status_code} {url}: {body!s}",
                )
                cls._raise_non_retryable_project_version_error(exc)
                raise
            except httpx.RequestError as e:
                logger.error(
                    action=EventAction.DOWNLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed GET {url}: {e}",
                )
                raise
            return response

    @classmethod
    @asynccontextmanager
    async def get_stream(
        cls,
        url: str,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        verify_ssl: bool = True,
    ) -> AsyncGenerator[httpx.Response]:
        default_headers = {"Accept": "*/*"}

        default_headers.update(merge_audit_headers(headers))

        ssl_context: ssl.SSLContext | bool = True
        if not verify_ssl:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

        logger.info(
            action=EventAction.DOWNLOAD,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            message=f"Initiating streaming GET request to {url}",
        )

        async with (
            httpx.AsyncClient(
                headers=default_headers,
                verify=ssl_context,
                timeout=None,
            ) as client,
            client.stream("GET", url, params=params) as resp,
        ):
            if resp.status_code != HTTP_OK:
                body = await resp.aread()
                content_type = resp.headers.get("content-type", "unknown")
                logger.error(
                    action=EventAction.DOWNLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed GET {resp.status_code} {url} (Content-Type: {content_type}): {body[:500]}",
                )
                raise httpx.HTTPStatusError(
                    "Streaming request failed",
                    request=resp.request,
                    response=resp,
                )

            logger.info(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message=f"Successfully initiated stream from {url} - Status: {resp.status_code}",
            )
            yield resp

    @classmethod
    async def post(
        cls,
        url: str,
        data: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        include_project_version: bool = True,
    ) -> httpx.Response:
        headers = merge_internal_api_key_header(merge_audit_headers(headers))
        if include_project_version:
            params = cls._with_project_version(params)
        async with httpx.AsyncClient(timeout=cls.timeout) as client:
            try:
                response = await client.post(url, params=params, data=data, json=json, headers=headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    body = exc.response.json()
                except Exception:
                    body = exc.response.text
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed POST {exc.response.status_code} {url}: {body!s}",
                )
                cls._raise_non_retryable_project_version_error(exc)
                raise
            except httpx.RequestError as e:
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed POST {url}: {e}",
                )
                raise

            return response

    @classmethod
    async def put(
        cls, url: str, content: AsyncIterable[bytes] | bytes, headers: dict[str, Any] | None = None
    ) -> httpx.Response:
        headers = merge_audit_headers(headers)
        async with httpx.AsyncClient(timeout=cls.timeout) as client:
            try:
                response = await client.put(url, content=content, headers=headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    body = exc.response.json()
                except Exception:
                    body = exc.response.text
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed PUT {exc.response.status_code} {url}: {body!s}",
                )
                cls._raise_non_retryable_project_version_error(exc)
                raise
            except httpx.RequestError as e:
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed PUT {url}: {e}",
                )
                raise
            except Exception as exc:
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"general Failed PUT {url}: {exc}",
                )
                raise

            return response

    @classmethod
    async def patch(
        cls,
        url: str,
        json: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        include_project_version: bool = True,
    ) -> httpx.Response:
        headers = merge_internal_api_key_header(merge_audit_headers(headers))
        if include_project_version:
            params = cls._with_project_version(params)
        async with httpx.AsyncClient(timeout=cls.timeout) as client:
            try:
                response = await client.patch(url, params=params, json=json, headers=headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    body = exc.response.json()
                except Exception:
                    body = exc.response.text
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed PATCH {exc.response.status_code} {url}: {body!s}",
                )
                cls._raise_non_retryable_project_version_error(exc)
                raise
            except httpx.RequestError as e:
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed PATCH {url}: {e}",
                )
                raise

            return response


class FilesApiClient(ApiClient):
    BASE_URL = settings.api.dms_base_url

    @classmethod
    async def get_file_by_id(cls, file_id: UUID) -> FileObject:
        response = await cls.get(f"{cls.BASE_URL}/v2/files/{file_id}")
        return FileObject(**response.json())

    @classmethod
    async def get_file(cls, file_name: str, project_id: str) -> FileObject:
        params = {
            "projectId": project_id,
            "file_type": "document",
            "name": file_name,
        }
        response = await cls.get(f"{cls.BASE_URL}/v2/files", params=params)
        files = response.json()
        if not files:
            logger.error(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"File {file_name} for project {project_id} not found.",
            )
            raise FileNotFoundError(f"File {file_name} for project {project_id} not found.")
        return FileObject(**files[0])

    @classmethod
    async def list_files(cls, project_id: str, file_type: str = "document") -> list[FileObject]:
        all_files: list[FileObject] = []
        page_size = 500  # DMS maximum allowed value

        page = 1
        has_next_page = True

        while has_next_page:
            params = {
                "projectId": project_id,
                "file_type": file_type,
                "include_deleted": False,
                "page": page,
                "page_size": page_size,
            }
            response = await cls.get(f"{cls.BASE_URL}/v2/files", params=params)
            batch = response.json()
            if not isinstance(batch, list):
                raise TypeError(
                    f"Expected a list from DMS /v2/files (page {page}), got {type(batch).__name__}: {batch!r}"
                )
            all_files.extend(FileObject(**f) for f in batch)

            has_next_page = len(batch) >= page_size
            page += 1

        return all_files

    @classmethod
    async def download_file(cls, file_id: UUID) -> BytesIO:
        resp = await cls.get(f"{cls.BASE_URL}/v2/files/{file_id}/generate-download-url")
        download_url = resp.json()["downloadUrl"]
        response = await cls.get(download_url, include_project_version=False, include_internal_api_key=False)
        return BytesIO(response.content)

    @classmethod
    async def upload_file(cls, file_data: FileUploadArgs, file_content: httpx.Response) -> FileObject:
        data = file_data.model_dump(by_alias=True, exclude_none=True)
        # Construct the correct payload based on the DMS API schema requirements
        # The API expects specific schemas like ProjectDocumentUpload, ProjectZipUpload, etc.
        confirm_payload = {
            "type": file_data.type,
            "filename": file_data.filename,
            "projectId": file_data.project_id,
            "createNewVersion": False,  # Required field for the schema
        }

        # Add optional fields if present
        if file_data.workflow_id:
            confirm_payload["workflowId"] = file_data.workflow_id
        if file_data.run_id:
            confirm_payload["runId"] = file_data.run_id

        # Log function entry
        logger.info(
            action=EventAction.UPLOAD,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            message="Starting file upload process",
        )

        try:
            # Step 1: Generate upload URL
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message="Requesting upload URL from DMS",
            )

            response = await cls.post(f"{cls.BASE_URL}/v2/internal/files/generate-upload-url", json=data)
            response_data = response.json()

            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message="Received upload URL from DMS",
            )

            # Step 2: Upload file content to storage
            if settings.USE_TRANSFER_ENCODING_CHUNKED:
                logger.info(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    message="Uploading file content using chunked transfer encoding",
                )

                await cls.put(
                    url=response_data["uploadUrl"],
                    content=file_content.aiter_bytes(),
                    headers={
                        "Content-Type": response_data["mimeType"],
                        "Transfer-Encoding": "chunked",
                    },
                )

                logger.info(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    message="Successfully uploaded file content (chunked)",
                )
            else:
                logger.info(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    message="Reading file content into memory for upload",
                )

                file_bytes = b"".join([chunk async for chunk in file_content.aiter_bytes()])

                logger.info(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    message="Uploading file content (non-chunked)",
                )

                await cls.put(
                    url=response_data["uploadUrl"],
                    content=file_bytes,
                    headers={
                        "Content-Type": response_data["mimeType"],
                    },
                )

                logger.info(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    message="Successfully uploaded file content (non-chunked)",
                )

            # Step 3: Confirm upload with DMS
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message="Confirming upload with DMS",
            )

            response = await cls.post(url=f"{cls.BASE_URL}/v2/internal/files/confirm-upload", json=confirm_payload)
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message=f"Confirming upload with DMS response {response.json()} ",
            )
            file_object = FileObject.model_validate(response.json())

            # Log successful completion
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message="File upload completed successfully",
            )

            return file_object

        except httpx.HTTPStatusError as exc:
            logger.error(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"HTTP error during file upload: {exc.response.status_code}",
            )
            raise
        except Exception as exc:
            logger.error(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"Unexpected error during file upload: {type(exc).__name__} error: {exc}",
            )
            raise

    @classmethod
    async def update_file(
        cls,
        file_id: UUID,
        update_data: FileUpdateRequest,
    ) -> FileObject:
        """Sends an update request to the DMS API."""
        response = await cls.patch(
            f"{cls.BASE_URL}/v2/files/{file_id}",
            json=update_data.model_dump(mode="json", exclude_unset=True),
        )

        return FileObject(**response.json())


class FVPClient(ApiClient):
    BASE_URL = settings.api.fvp_base_url

    @classmethod
    async def send_fvp_results(cls, project_id: str, file_id: str) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/results",
                json={"file_id": file_id},
            )
        ).json()

    @classmethod
    async def get_results(cls, project_id: str) -> dict[str, Any]:
        return (await cls.get(f"{cls.BASE_URL}/{project_id}")).json()

    @classmethod
    async def get_template_document_types(cls, project_id: str) -> list[TemplateDocumentTypeResponse]:
        response = await cls.get(f"{cls.BASE_URL}/{project_id}/template-document-types")
        response.raise_for_status()
        return [TemplateDocumentTypeResponse.model_validate(item) for item in response.json()]

    @classmethod
    async def send_toc_matching_results(cls, project_id: str, file_id: str) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/toc-notes/results",
                json={"file_id": file_id},
            )
        ).json()


class PlausibilityClient(ApiClient):
    BASE_URL = settings.api.plausibility_notes_base_url

    @classmethod
    async def send_plausibility_results(cls, project_id: str, file_id: str) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/plausibility-notes/{project_id}/job-done",
                json={"fileId": file_id},
            )
        ).json()


class ExaminationServiceClient(ApiClient):
    BASE_URL = settings.api.examination_service_base_url

    @classmethod
    async def get_norm_deconstructions(
        cls,
        *,
        jurabk: str | None = None,
        paragraph: str | None = None,
    ) -> list[dict[str, Any]]:
        params = {}
        if jurabk is not None:
            params["jurabk"] = jurabk
        if paragraph is not None:
            params["paragraph"] = paragraph
        return (
            await cls.get(
                f"{cls.BASE_URL}/norm-deconstructions/",
                params=params,
                include_project_version=False,
            )
        ).json()

    @classmethod
    async def list_nodes(cls, project_id: UUID) -> dict[str, Any]:
        return (await cls.get(f"{cls.BASE_URL}/{project_id}/nodes")).json()

    @classmethod
    async def batch_get_nodes(cls, project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/batch-nodes",
                json={"nodes": nodes},
            )
        ).json()

    @classmethod
    async def update_nodes(
        cls,
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/update",
                json={
                    "inserts": inserts,
                    "updates": updates or [],
                    "deletes": deletes or [],
                },
            )
        ).json()


class DiPlanClient(ApiClient):
    BASE_URL = settings.api.diplan_base_url

    @classmethod
    async def confirm_download(cls, file_id: UUID, dms_file_id: UUID) -> UUID:
        return (
            await cls.post(
                f"{cls.BASE_URL}/internal/diplan/confirm_file_download/{file_id}",
                json={"dmsFileId": str(dms_file_id)},
            )
        ).json()


class ObjectionsServiceClient(ApiClient):
    BASE_URL = settings.api.objections_service_base_url

    @classmethod
    async def list_processed_file_ids(cls, project_id: UUID) -> list[UUID]:
        response = await cls.get(f"{cls.BASE_URL}/{project_id}/ewms/processed-file-ids")
        return [UUID(file_id) for file_id in response.json().get("file_ids", [])]

    @classmethod
    async def store_extraction_results(cls, project_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        response = await cls.post(
            f"{cls.BASE_URL}/{project_id}/ewms/argument-extraction",
            json=payload,
        )
        return response.json()

    @classmethod
    async def store_classification_results(cls, project_id: UUID, payload: ClassificationRequest) -> dict[str, Any]:
        response = await cls.patch(
            f"{cls.BASE_URL}/{project_id}/ewms/classification",
            json=payload.model_dump(mode="json"),
        )
        return response.json()

    @classmethod
    async def mark_classification_failed(cls, project_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        response = await cls.patch(
            f"{cls.BASE_URL}/{project_id}/ewms/classification-failed",
            json=payload,
        )
        return response.json()

    @classmethod
    async def mark_injection_detected(cls, project_id: UUID, payload: InjectionDetectedRequest) -> dict[str, Any]:
        response = await cls.post(
            f"{cls.BASE_URL}/{project_id}/ewms/injection-detected",
            json=payload.model_dump(mode="json"),
        )
        return response.json()


class FPPClient(ApiClient):
    BASE_URL = settings.api.fpp_base_url

    @classmethod
    async def confirm_download(cls, file_id: UUID, dms_file_id: UUID) -> dict[str, Any]:
        """
        Confirm that a file has been downloaded from FPP and uploaded to DMS.

        Args:
            file_id: FPP file ID
            dms_file_id: DMS file ID where the file was uploaded

        Returns:
            Response from FPP service
        """
        return (
            await cls.post(
                f"{cls.BASE_URL}/internal/fpp/files/{file_id}/confirm-download",
                json={"dms_file_id": str(dms_file_id)},
            )
        ).json()


class PlsApiClient(ApiClient):
    BASE_URL = settings.api.pls_base_url

    @classmethod
    async def get_latest_project_version(cls, project_id: UUID | str) -> int:
        response = await cls.get(f"{cls.BASE_URL}/projects/{project_id}/latest-version")
        body = response.json()
        return int(body.get("latest_version", body.get("latestVersion")))

    @classmethod
    async def update_project_status(cls, project_id: UUID | str, internal_name: ProjectInternalStatus) -> None:
        await cls.patch(
            f"{cls.BASE_URL}/projects/{project_id}/status",
            json={"internalName": internal_name},
            include_project_version=False,
        )

    @classmethod
    async def list_nodes(cls, project_id: UUID) -> dict[str, Any]:
        return (await cls.get(f"{cls.BASE_URL}/{project_id}/nodes")).json()

    @classmethod
    async def batch_get_nodes(cls, project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/batch-nodes",
                json={"nodes": nodes},
            )
        ).json()

    @classmethod
    async def update_nodes(
        cls,
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/update",
                json={
                    "inserts": inserts,
                    "updates": updates or [],
                    "deletes": deletes or [],
                },
            )
        ).json()

    @classmethod
    async def list_topics(
        cls,
        project_type_id: UUID | None = None,
        project_id: UUID | None = None,
        include_deleted: bool = False,
        page_size: int = 200,
    ) -> list[TopicResponse]:
        """List all available topics."""
        all_topics: list[TopicResponse] = []

        page = 1
        has_next_page = True

        while has_next_page:
            params: dict[str, str | int | bool] = {
                "page": page,
                "pageSize": page_size,
                "includeDeleted": include_deleted,
            }

            if project_type_id:
                params["projectTypeId"] = str(project_type_id)

            if project_id:
                params["projectId"] = str(project_id)

            response = await cls.get(f"{cls.BASE_URL}/topics", params=params)

            batch = response.json()

            if not isinstance(batch, list):
                raise TypeError(f"Expected list from /topics (page {page}), got {type(batch).__name__}: {batch!r}")

            all_topics.extend(TopicResponse.model_validate(item) for item in batch)

            has_next_page = len(batch) >= page_size
            page += 1

        return all_topics


class AdministrativeFileDraftApiClient(ApiClient):
    BASE_URL = settings.api.administrative_file_draft_base_url

    @classmethod
    async def list_nodes(cls, project_id: UUID) -> dict[str, Any]:
        return (await cls.get(f"{cls.BASE_URL}/{project_id}/nodes")).json()

    @classmethod
    async def batch_get_nodes(cls, project_id: UUID, node: NodeRef) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/batch-nodes",
                json={"nodes": [node.model_dump(mode="json")]},
            )
        ).json()

    @classmethod
    async def update_nodes(
        cls,
        project_id: UUID,
        inserts: Sequence[Mapping[str, Any]],
        updates: Sequence[Mapping[str, Any]] | None = None,
        deletes: Sequence[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return (
            await cls.post(
                f"{cls.BASE_URL}/{project_id}/update",
                json={
                    "inserts": inserts,
                    "updates": updates or [],
                    "deletes": deletes or [],
                },
            )
        ).json()

    @classmethod
    async def get_risks(cls, project_id: UUID) -> list[AdministrativeFileDraftRisk]:
        risks = (await cls.get(f"{cls.BASE_URL}/risks/{project_id}")).json()
        return [AdministrativeFileDraftRisk.model_validate(risk) for risk in risks]
