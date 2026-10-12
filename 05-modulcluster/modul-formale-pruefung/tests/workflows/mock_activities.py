from typing import Any

from temporal.contracts import DMSFileResponse
from temporalio import activity

from src.activities.dms_activities import UploadTemporalCheckpointInput
from src.activities.llm_matching_activities import (
    ClassificationSummaryActivityParams,
    DocumentGroupingActivityParams,
    DocumentMatchingActivityParams,
    UnassignedDocumentAnalysisParams,
)
from src.schemas.dms_schemas import (
    ChunkMetadata,
    DMSDocument,
    DMSInhaltsExtraction,
    DocumentChunk,
    DownloadJsonFromDmsInput,
    InhaltsExtraktionChunksActivityParams,
)
from src.schemas.inhaltsverzeichnis_finder_schemas import (
    ChunkLLMClassificationActivityParams,
    ConnectedChunkLLMClassificationActivityParams,
    DocumentTypeDescriptionGenerationActivityInput,
    DocumentTypeDescriptionResult,
    InhaltsverzeichnisClassificationResult,
    InhaltsverzeichnisEntry,
    InhaltsverzeichnisParsedResult,
    InhaltsverzeichnisParserActivityInput,
    OverallLLMClassificationActivityParams,
    SelectInhaltsverzeichnisLLMActivityParams,
)
from src.schemas.llm_matching_schemas import (
    DocumentClassificationMatchResult,
    DocumentGroup,
    UnassignedDocumentReason,
)


async def llm_classification_summary(
    params: ClassificationSummaryActivityParams,
) -> str:
    """Returns a dummy summary string for the document."""
    return f"Mock summary for doc: {params.document_name}. Contains technical planning details."


async def llm_document_grouping(
    params: DocumentGroupingActivityParams,
) -> list[DocumentGroup]:
    """Groups all input documents into a single mock group."""
    # Assuming the first doc is the representative for simplicity
    if not params.document_names:
        return []

    return [
        DocumentGroup(
            group_name=f"Group - {params.document_names[0]}",
            representative_index=0,
            document_indices=list(range(len(params.document_names))),
        )
    ]


async def llm_match_document_to_list(
    params: DocumentMatchingActivityParams,
) -> DocumentClassificationMatchResult:
    """Returns a successful match to the first candidate type."""
    return DocumentClassificationMatchResult(
        match_index=0,
        confidence=0.95,
        reasoning="Document content aligns perfectly with B-Plan definitions.",
    )


async def llm_analyze_unassigned_document(
    params: UnassignedDocumentAnalysisParams,
) -> UnassignedDocumentReason:
    """Returns a generic reason for unassigned documents."""
    return UnassignedDocumentReason(
        reasoning="Content was too ambiguous to match any provided candidate.",
        confidence=0.95,
    )


@activity.defn
async def upload_temporal_checkpoint(
    params: UploadTemporalCheckpointInput,
) -> DMSFileResponse:
    """Simulates a successful upload response."""
    return DMSFileResponse(
        id="UUID",
        type="temporal_checkpoint",
        filename="results.json",
        bucket_path="dms_documents/path/results.json",
        project_id="PUUID",
    )


@activity.defn
async def get_inhalts_extraktion_docs(project_id: str) -> list[DMSDocument]:
    """Returns a list of mock DMS documents."""
    return [
        DMSDocument(
            project_id="PUUID",
            document_id="FUUID1",
            document_name="plan_v1.pdf",
            content_extraction_id="EUUID",
        ),
        DMSDocument(
            project_id="PUUID",
            document_id="FUUID2",
            document_name="letter.pdf",
            content_extraction_id="EUUID",
        ),
    ]


@activity.defn
async def get_inhalts_extraktion_doc_chunks(
    params: InhaltsExtraktionChunksActivityParams,
) -> DMSInhaltsExtraction:
    """Returns mock extracted text chunks."""
    return DMSInhaltsExtraction(
        chunks=[
            DocumentChunk(
                chunk_id="CUUID1",
                page_content="Page 1",
                metadata=ChunkMetadata(page_numbers=[0]),
            ),
            DocumentChunk(
                chunk_id="CUUID2",
                page_content="Page 2",
                metadata=ChunkMetadata(page_numbers=[1]),
            ),
        ],
        summary="Example Summary",
    )


async def llm_chunk_classification(
    params: ChunkLLMClassificationActivityParams,
) -> InhaltsverzeichnisClassificationResult:
    """Mock: Classifies a text chunk as a Table of Contents."""
    return InhaltsverzeichnisClassificationResult(reasoning="", is_global_inhalts_verzeichnis=len(params.chunk) > 0)


async def llm_overall_classification(
    params: OverallLLMClassificationActivityParams,
) -> InhaltsverzeichnisClassificationResult:
    """Mock: Classifies a chunk using document context."""
    return InhaltsverzeichnisClassificationResult(reasoning="", is_global_inhalts_verzeichnis=True)


async def llm_select_global_inhaltsverzeichnis_document_name(
    params: SelectInhaltsverzeichnisLLMActivityParams,
) -> int | None:
    """Mock: Analyzes filenames to find the global Master Index."""
    if not params.document_names:
        return None
    return 0


async def llm_connected_chunk_classification(
    params: ConnectedChunkLLMClassificationActivityParams,
) -> bool:
    """Mock: Determines if two text chunks are sequentially connected."""
    return True


async def llm_inhaltsverzeichnis_parser(
    params: InhaltsverzeichnisParserActivityInput,
) -> InhaltsverzeichnisParsedResult:
    """Mock: Parses TOC chunks into a structured object."""
    mock_entry = InhaltsverzeichnisEntry(entry_title="Mock Chapter", hierarchy_path=["Part 1"], entry_number="1.1")
    return InhaltsverzeichnisParsedResult(entries=[mock_entry])


async def llm_document_type_description_generation(
    params: DocumentTypeDescriptionGenerationActivityInput,
) -> DocumentTypeDescriptionResult:
    """Mock: Generates a contextual explanation for a chapter."""
    description = f"This is a mock description for '{params.entry_title}'."
    return DocumentTypeDescriptionResult(document_type_description=description)


@activity.defn
async def download_json_from_dms(params: DownloadJsonFromDmsInput) -> Any:
    """
    Mock: Downloads a JSON file from the DMS using its file ID.

    This mock activity simulates retrieving a file by returning a hardcoded
    Python dictionary that conforms to the LLMMatchingWorkflowOutput structure.

    Args:
        params (DownloadJsonFromDmsInput): The input parameters containing the file ID.

    Returns:
        Any: The parsed JSON content of the file as a dictionary.
    """
    # This is a hardcoded Python dictionary that represents the JSON structure
    # of an LLMMatchingWorkflowOutput object.
    mock_json_output = {
        "matched_document_types": [
            {
                "required_document_type": {
                    "category": "Financial Reports",
                    "document_type_name": "Annual Financial Report",
                    "document_type_description": "A concise description of the document's content and purpose, used for semantic matching.",
                },
                "assigned_documents": [
                    {
                        "document_name": "financial_report_2023.pdf",
                        "document_id": "doc_abc123",
                        "document_extraction_id": "extract_xyz789",
                        "reasoning": "The document title and content match the criteria for an Annual Financial Report.",
                        "confidence": 0.95,
                    }
                ],
                "confidence": 0.95,
            }
        ],
        "unassigned_documents": [
            {
                "document_name": "marketing_brochure_q1.pdf",
                "document_id": "doc_def456",
                "document_extraction_id": "extract_uvw456",
                "reasoning": "This document appears to be marketing material and does not fit any required document type.",
                "confidence": 0.40,
            }
        ],
    }
    return mock_json_output


LLM_MATCHING_MOCKS = {
    "llm_document_grouping": llm_document_grouping,
}

LLM_MATCHING_SINGLE_MOCKS = {
    "llm_classification_summary": llm_classification_summary,
    "llm_match_document_to_list": llm_match_document_to_list,
    "llm_analyze_unassigned_document": llm_analyze_unassigned_document,
}

INHALTSVERZEICHNIS_MOCKS = {
    "llm_chunk_classification": llm_chunk_classification,
    "llm_overall_classification": llm_overall_classification,
    "llm_select_global_inhaltsverzeichnis_document_name": llm_select_global_inhaltsverzeichnis_document_name,
    "llm_connected_chunk_classification": llm_connected_chunk_classification,
    "llm_inhaltsverzeichnis_parser": llm_inhaltsverzeichnis_parser,
    "llm_document_type_description_generation": llm_document_type_description_generation,
}

MODULE_MOCKS = [
    ("src.workflows.llm_matching", LLM_MATCHING_MOCKS),
    ("src.workflows.llm_matching_single_document", LLM_MATCHING_SINGLE_MOCKS),
    ("src.workflows.inhaltsverzeichnis_finder", INHALTSVERZEICHNIS_MOCKS),
]

PATCHES = [(f"{module}.{name}", fn) for module, group in MODULE_MOCKS for name, fn in group.items()]
