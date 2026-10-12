"""Schemas for one grouped risk-screening child workflow batch."""

from pydantic import BaseModel, Field

from src.workflows.check_logic_wf.schemas.context_checker_schemas import ContextCheckerOutput
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import GroupedScreeningBundle, ScreeningHit


class ScreeningBatchInput(BaseModel):
    """Grouped bundles that should be screened for one document."""

    project_id: str
    document_id: str
    bundles: list[GroupedScreeningBundle]
    extra_hits: list[ScreeningHit] = Field(
        default_factory=list,
        description="Deterministic candidate hits (detector, overflow) that skip the LLM screener and go to the checker.",
    )


class ScreeningBatchOutput(BaseModel):
    """Context-check results produced from a screening batch."""

    context_check_outputs: list[ContextCheckerOutput]
