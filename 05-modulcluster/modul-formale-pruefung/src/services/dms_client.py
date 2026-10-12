import logging

from temporal.dms_client import DmsClient

from src.config.config import config
from src.config.env import ENV
from src.schemas.dms_schemas import (
    DMSDocument,
    DMSInhaltsExtraction,
    DocumentDetailsResponse,
)

logger = logging.getLogger(__name__)


class DMSClient(DmsClient):
    """
    DMS client with Inhaltsextraktion mapping logic.

    This class adds the mapping of storage files to Inhaltsextraktion domain
    models using file_id as the primary identifier.
    """

    def __init__(self, timeout: int = 120) -> None:
        """
        Initializes the DMS client.

        Args:
            timeout (int): Request timeout in seconds. Defaults to 120.
        """
        super().__init__(
            ENV.DMS_BASE_URL,
            timeout=timeout,
            page_size=config.DMS.PAGE_SIZE,
            max_pages=config.DMS.MAX_PAGES,
        )

    async def get_dms_documents(self, project_id: str) -> list[DMSDocument]:
        """
        Pairs documents with their corresponding processed extraction files.

        Args:
            project_id (str): The unique identifier for the project.

        Returns:
            list[DMSDocument]: A list of objects containing paired document and extraction IDs.
        """
        return [
            DMSDocument(
                project_id=project_id,
                document_name=doc.filename,
                document_id=doc.id,
                content_extraction_id=extraction_id,
            )
            for doc, extraction_id in await self.list_documents_with_extractions(project_id)
        ]

    async def get_extraction_data(
        self,
        dms_document: DMSDocument,
        n_pages: int | None = None,
        include_summary: bool = False,
    ) -> DMSInhaltsExtraction:
        """
        Retrieves and filters chunks based on page numbers using file_id.

        Args:
            dms_document: The document object containing the file identifier and metadata.
            n_pages (Optional[int]): Filter for chunks with page <= n_pages.
            include_summary (bool): Whether to include the summary.

        Returns:
            DMSInhaltsExtraction: Filtered chunks and optional summary.
        """
        f_id = dms_document.content_extraction_id
        try:
            data = await self.download_json(f_id)
        except FileNotFoundError as e:
            # We do not want to fail the workflow and we do not want to retry on a 404
            logger.error(f"Error processing chunks for ID {f_id}: DMS File not found")
            return DMSInhaltsExtraction(chunks=[], error=str(e))
        details = DocumentDetailsResponse(**data)

        filtered_chunks = [
            chunk
            for chunk in details.chunks
            if n_pages is None or any(p <= n_pages for p in chunk.metadata.page_numbers)
        ]
        return DMSInhaltsExtraction(
            chunks=filtered_chunks,
            summary=details.metadata.summary if include_summary else None,
        )
