from typing import Literal

from pydantic import BaseModel, Field


class HealthStatus(BaseModel):
    """Base model for health status"""

    status: Literal["ok", "not ready", "starting"] = Field(..., description="Overall status")
    reason: str | None = Field(None, description="Failure reason if not ok")


class CheckResponse(BaseModel):
    """Response model for health checks"""

    status: Literal["ok"] = "ok"
