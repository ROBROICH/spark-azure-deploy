"""Application configuration for internal defaults that do not vary between deploys."""

from pydantic import BaseModel


class RiskCheckerWorkflowConfig(BaseModel):
    """Thresholds used by the risk checker workflow."""

    RELEVANCE_RATING_THRESHOLD: int = 3
    QUALITY_DEFECT_RATING_THRESHOLD: int = 3


class Config:
    """Global configuration object with all default settings."""

    RISK_CHECKER_WORKFLOW: RiskCheckerWorkflowConfig = RiskCheckerWorkflowConfig()


config = Config()
