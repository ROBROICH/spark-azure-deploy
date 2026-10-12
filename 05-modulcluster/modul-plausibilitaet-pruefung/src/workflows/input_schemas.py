"""Workflow input models for single-document runs."""

from pydantic import BaseModel, Field

from src.workflows.check_logic_wf.schemas.risk_screener_schemas import DocumentBundleResult


class SingleDocumentWorkflowInputSchema(BaseModel):
    """Input schema for single document workflow."""

    project_id: str = Field(..., description="ID of the project associated with this workflow run.")
    document_id: str = Field(..., description="ID of the document to be processed.")
    is_erlaeuterungsbericht: bool = Field(
        False,
        description="Flag indicating if the document is an Erläuterungsbericht, which may require special handling in the workflow.",
    )


class CheckSingleDocumentWorkflowInputSchema(BaseModel):
    """Input schema for the plausibility check of a single document.

    The bundles are this document's share of the project-wide reduced claim pairs.
    """

    project_id: str = Field(..., description="ID of the project associated with this workflow run.")
    document_id: str = Field(..., description="ID of the document to be checked.")
    has_claims: bool = Field(
        ...,
        description="Whether the document has indexed claims; false uploads an empty checkpoint without screening.",
    )
    bundle_result: DocumentBundleResult = Field(
        ...,
        description="Screening bundles and overflow pairs this document owns after the project-wide pair reduction.",
    )
