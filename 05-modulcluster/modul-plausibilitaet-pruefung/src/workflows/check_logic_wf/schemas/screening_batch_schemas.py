"""Schemas for one grouped risk-screening child workflow batch."""

from pydantic import BaseModel

from src.workflows.check_logic_wf.schemas.context_checker_schemas import ContextCheckerOutput
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import GroupedScreeningBundle


class ScreeningBatchInput(BaseModel):
    """Grouped bundles that should be screened for one document."""

    project_id: str
    document_id: str
    bundles: list[GroupedScreeningBundle]


class ScreeningBatchOutput(BaseModel):
    """Context-check results produced from a screening batch."""

    context_check_outputs: list[ContextCheckerOutput]
