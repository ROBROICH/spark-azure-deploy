import logging

import httpx
from temporal.contracts import LLMMatchingOutput
from temporal.dms_client import DmsClient

from src.config.config import config
from src.config.env import ENV
from src.dms.schemas import BaseMetadata, ProjectBaseMetadataStatus

_MAX_CONNECTIONS = 1500
_HTTP_LIMITS = httpx.Limits(max_connections=_MAX_CONNECTIONS, max_keepalive_connections=_MAX_CONNECTIONS)

logger = logging.getLogger(__name__)

_ERLAEUTERUNGSBERICHT_TYPE = "Erläuterungsbericht"


class DMSClient(DmsClient):
    """DMS client with content-extraction mapping helpers."""

    def __init__(self, timeout: int = 120) -> None:
        """Initialize the client with a request timeout in seconds."""

        super().__init__(
            ENV.DMS_BASE_URL,
            timeout=timeout,
            limits=_HTTP_LIMITS,
            page_size=config.DMS.PAGE_SIZE,
            max_pages=config.DMS.MAX_PAGES,
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
        raw_base_metadata = summary_json.get("baseMetadata")
        if raw_base_metadata is None:
            logger.warning(
                "Project %s has summary.json without baseMetadata. Using explicit unknown fallback.",
                project_id,
            )
            return (
                BaseMetadata.fallback_unknown(project_id),
                ProjectBaseMetadataStatus.FALLBACK_MISSING,
            )

        base_metadata = BaseMetadata.model_validate(raw_base_metadata)

        return base_metadata, ProjectBaseMetadataStatus.COMPLETE

    async def fetch_erlauterungsbericht_document_ids(self, classification_file_id: str) -> list[str]:
        """Fetches and extracts the single highest-confidence Erläuterungsbericht document ID from DMS classification output."""
        classification = LLMMatchingOutput.model_validate(await self.download_json(classification_file_id))
        for entry in classification.matched_document_types:
            if entry.required_document_type.document_type_name == _ERLAEUTERUNGSBERICHT_TYPE:
                assigned = entry.assigned_documents
                if not assigned:
                    return []
                best = max(assigned, key=lambda document: document.confidence)
                logger.info(
                    f"Selected 1 of {len(assigned)} {_ERLAEUTERUNGSBERICHT_TYPE} candidates "
                    f"(highest confidence: {best.confidence}, "
                    f"document: {best.document_name}). "
                    f"Remaining {len(assigned) - 1} documents will be treated as normal."
                )
                return [best.document_id]
        logger.info(f"No {_ERLAEUTERUNGSBERICHT_TYPE} documents found.")
        return []
