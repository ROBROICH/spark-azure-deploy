"""DMS HTTP client and mapping helpers for plausibility workflows."""

import json
import logging
import tempfile
from typing import Any

import httpx
from temporal.project_context import current_project_context

from src.config.config import config
from src.config.env import ENV
from src.dms.schemas import (
    BaseMetadata,
    DMSDocument,
    DMSFileResponse,
    DocDataResult,
    DocumentDetailsResponse,
    DocumentMetadata,
    ProjectBaseMetadataStatus,
)

_HTTP_LIMITS = httpx.Limits(max_connections=1500, max_keepalive_connections=1500)

logger = logging.getLogger(__name__)

_ERLAUTERUNGSBERICHT_TYPE = "Erläuterungsbericht"


def _with_project_version_params(params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Attach the Temporal project version when an activity context provides it."""

    context = current_project_context()
    if context is None:
        return params

    updated_params = dict(params or {})
    updated_params.setdefault("project_version", context.project_version)
    return updated_params


class DMSClient:
    """Authenticated DMS client with content-extraction mapping helpers."""

    def __init__(self, timeout: int = 120) -> None:
        """Initialize the client with a request timeout in seconds."""

        self.base_url = ENV.DMS_BASE_URL.rstrip("/")
        self.timeout = timeout
        self.headers = {"Content-Type": "application/json"}

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        """Send one authenticated DMS request and return the parsed JSON body."""

        async with httpx.AsyncClient(timeout=self.timeout, limits=_HTTP_LIMITS) as client:
            url = f"{self.base_url}{path}"
            resp = await client.request(method, url, headers=self.headers, **kwargs)
            resp.raise_for_status()
            return resp.json()

    async def list_files(
        self, project_id: str, file_type: str = "document"
    ) -> list[DMSFileResponse]:
        """List all DMS files for one project and file type across pages."""

        all_files = []
        page = 1
        # Safety limit to prevent infinite loops (100k files)
        while page <= config.DMS.MAX_PAGES:
            params = {
                "projectId": project_id,
                "page_size": config.DMS.PAGE_SIZE,
                "include_deleted": False,
                "file_type": file_type,
                "page": page,
            }
            data = await self._request("GET", "/v2/files", params=_with_project_version_params(params))
            if not data:
                break
            all_files.extend([DMSFileResponse(**item) for item in data])
            if len(data) < config.DMS.PAGE_SIZE:
                break
            page += 1
        return all_files

    async def get_dms_documents(self, project_id: str) -> list[DMSDocument]:
        """Pair source documents with their processed extraction JSON files."""

        docs = await self.list_files(project_id, file_type="document")
        extraction_docs = await self.list_files(
            project_id, file_type="content_extraction"
        )
        ext_map = {d.filename: d.id for d in extraction_docs}
        results = []
        for d in docs:
            base_path = d.filename.rsplit(".", 1)[0]
            file_name = base_path.split("/")[-1]
            target_path = f"{base_path}/{file_name}_processed.json"
            if target_path in ext_map:
                results.append(
                    DMSDocument(
                        project_id=project_id,
                        document_name=d.filename,
                        document_id=d.id,
                        content_extraction_id=ext_map[target_path],
                    )
                )
        return results

    async def get_download_url(self, file_id: str) -> str:
        """Request a signed download URL from DMS."""

        # Internal route: the URL is signed against the internal storage endpoint so this
        # service-side caller can reach it (the public route signs the browser-facing host).
        data = await self._request(
            "GET",
            f"/v2/internal/files/{file_id}/generate-download-url",
            params=_with_project_version_params(),
        )
        return data["downloadUrl"]

    async def download_json(self, file_id: str) -> Any:
        """Download and parse a DMS JSON file via the signed URL flow."""

        download_url = await self.get_download_url(file_id)
        async with httpx.AsyncClient(timeout=self.timeout, limits=_HTTP_LIMITS) as client:
            resp = await client.get(download_url)
            resp.raise_for_status()
            with tempfile.NamedTemporaryFile(
                mode="w+", delete=True, suffix=".json", encoding="utf-8"
            ) as tmp:
                tmp.write(resp.text)
                tmp.seek(0)
                return json.load(tmp)

    async def get_extraction_data(
        self,
        dms_document: DMSDocument,
        n_pages: int | None = None,
        include_summary: bool = False,
    ) -> DocDataResult:
        """Load extraction details and optionally keep only early-page subchunks."""

        f_id = dms_document.content_extraction_id
        data = await self.download_json(f_id)
        details = DocumentDetailsResponse(**data)

        filtered_chunks = [
            sub_chunk
            for chunk in details.chunks
            for sub_chunk in (chunk.sub_chunks or [])
            if n_pages is None or any(p <= n_pages for p in sub_chunk.metadata.page_numbers)
        ]

        return DocDataResult(
            dms_document=dms_document,
            title=details.metadata.title,
            chunks=filtered_chunks,
            summary=details.metadata.summary if include_summary else None,
        )

    async def get_project_base_metadata(
        self,
        project_id: str,
    ) -> tuple[BaseMetadata, ProjectBaseMetadataStatus]:
        """Read project metadata from the extraction summary or return a known fallback."""

        extraction_files = await self.list_files(project_id=project_id, file_type="content_extraction")

        summary_candidates = [extr_file for extr_file in extraction_files if extr_file.filename == "summary.json"]

        if len(summary_candidates) != 1:
            raise ValueError(f"Found {len(summary_candidates)} summary files for project {project_id}")

        summary_extraction_id = summary_candidates[0].id

        summary_json = await self.download_json(summary_extraction_id)
        raw_base_metadata = summary_json.get("base_metadata")
        if raw_base_metadata is None:
            logger.warning(
                "Project %s has summary.json without base_metadata. Using explicit unknown fallback.",
                project_id,
            )
            return (
                BaseMetadata.fallback_unknown(project_id),
                ProjectBaseMetadataStatus.FALLBACK_MISSING,
            )

        base_metadata = BaseMetadata.model_validate(raw_base_metadata)

        return base_metadata, ProjectBaseMetadataStatus.COMPLETE

    async def upload_file(
        self,
        project_id: str,
        filename: str,
        payload: Any,
        file_type: str = "document",
        extra_params: dict[str, Any] | None = None,
    ) -> DMSFileResponse:
        """Uploads a JSON payload to the DMS via signed URL and confirms it.
        Args:
            project_id: The unique identifier of the project.
            filename: The target path/name for the file in storage.
            payload: The JSON-serializable data to be uploaded.
            file_type: The DMS file category (e.g., 'content_extraction').
            extra_params: Optional additional metadata fields (e.g., workflow_id, run_id).
        Returns:
            The metadata of the confirmed file.
        Raises:
            httpx.HTTPStatusError: If the URL generation, upload, or confirmation fails.
        """
        params = {
            "filename": filename,
            "projectId": project_id,
            "type": file_type,
            "createNewVersion": True,
            **(extra_params or {}),
        }
        meta = await self._request(
            "POST",
            "/v2/internal/files/generate-upload-url",
            params=_with_project_version_params(),
            json=params,
        )
        async with httpx.AsyncClient(timeout=self.timeout, limits=_HTTP_LIMITS) as client:
            resp = await client.put(
                meta["uploadUrl"],
                content=json.dumps(payload),
                headers={"Content-Type": str(meta.get("mimeType", "application/json"))},
            )
            resp.raise_for_status()
        data = await self._request(
            "POST",
            "/v2/internal/files/confirm-upload",
            params=_with_project_version_params(),
            json=params,
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
        """Specific helper to upload temporal checkpoints.
        Args:
            project_id: The unique identifier of the project.
            workflow_id: The temporal workflow identifier.
            run_id: The temporal run identifier.
            filename: The target filename in storage.
            payload: The JSON-serializable state to save.
        Returns:
            The metadata of the confirmed checkpoint file.
        """
        extra = {"workflow_id": workflow_id, "run_id": run_id}
        return await self.upload_file(
            project_id=project_id,
            filename=filename,
            payload=payload,
            file_type="temporal_checkpoint",
            extra_params=extra,
        )

    async def fetch_erlauterungsbericht_document_ids(self, classification_file_id: str) -> list[str]:
        """Fetches and extracts the single highest-confidence Erläuterungsbericht document ID from DMS classification output."""
        if not classification_file_id:
            logger.warning("No classification file ID provided, skipping Erläuterungsbericht document fetch.")
            return []
        classification_data = await self.download_json(classification_file_id)
        for entry in classification_data.get("matched_document_types", []):
            if entry.get("required_document_type", {}).get("document_type_name") == _ERLAUTERUNGSBERICHT_TYPE:
                assigned = [doc for doc in entry.get("assigned_documents", []) if doc.get("document_id")]
                if not assigned:
                    return []
                best = max(assigned, key=lambda d: d.get("confidence", 0.0))
                logger.info(
                    f"Selected 1 of {len(assigned)} {_ERLAUTERUNGSBERICHT_TYPE} candidates "
                    f"(highest confidence: {best.get('confidence', 'N/A')}, "
                    f"document: {best.get('document_name', best['document_id'])}). "
                    f"Remaining {len(assigned) - 1} documents will be treated as normal."
                )
                return [best["document_id"]]
        logger.info(f"No {_ERLAUTERUNGSBERICHT_TYPE} documents found.")
        return []

    async def get_document_metadata(self, project_id: str, document_id: str) -> DocumentMetadata:
        """Fetches document metadata from DMS for a given project and document ID."""
        files = await self.list_files(project_id=project_id, file_type="document")
        for f in files:
            if f.id == document_id:
                return DocumentMetadata(
                    project_id=project_id,
                    document_id=document_id,
                    title=f.filename,
                )
        raise ValueError(f"Document with ID {document_id} not found in project {project_id}")
