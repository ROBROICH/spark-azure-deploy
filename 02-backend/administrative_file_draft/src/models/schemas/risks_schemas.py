"""Pydantic schemas for risks API."""

from uuid import UUID

from pydantic import BaseModel, Field, model_validator
from pydantic.alias_generators import to_camel

from src.models.risk_enums import RiskStatus


class SuccessResponse(BaseModel):
    """Response model for successful operations (e.g. DELETE)."""

    success: bool = Field(True, description="Indicates whether the operation was successful")


class RiskResponse(BaseModel):
    """Response model for a risk entry."""

    id: UUID = Field(..., description="The unique identifier of the risk")
    project_id: UUID = Field(..., description="The id of the project")
    problem: str = Field(..., description="Description of the identified problem")
    recommendation: str | None = Field(None, description="Suggested corrective action")
    quote: str | None = Field(None, description="Verbatim excerpt from the source document")
    severity: int = Field(..., ge=1, le=10, description="Severity score from 1 (low) to 10 (high)")
    implication: str = Field(..., description="Potential impact of the identified issue")
    status: RiskStatus = Field(..., description="Current status of the risk")
    vae_node_id: UUID = Field(..., description="The id of the vae node")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
        "alias_generator": to_camel,
    }


class RiskModel(BaseModel):
    """Input model for a single risk in a POST request. Extra fields are ignored."""

    problem: str = Field(..., description="Description of the identified problem")
    recommendation: str | None = Field(None, description="Suggested corrective action")
    quote: str | None = Field(None, description="Verbatim excerpt from the source document")
    severity: int = Field(..., ge=1, le=10, description="Severity score from 1 (low) to 10 (high)")
    implication: str = Field(..., description="Potential impact of the identified issue")
    vae_node_id: UUID = Field(..., description="The id of the vae node")

    model_config = {
        "extra": "ignore",
        "populate_by_name": True,
    }


class CreateRisksRequest(BaseModel):
    """Request model for creating risks."""

    risks: list[RiskModel] = Field(..., description="List of risks to create")

    model_config = {
        "populate_by_name": True,
    }


_NON_NULLABLE_FIELDS = ("problem", "implication", "severity", "vae_node_id")


class UpdateRiskRequest(BaseModel):
    """Request model for updating a risk. All fields are optional."""

    problem: str | None = Field(None, description="Description of the identified problem")
    recommendation: str | None = Field(None, description="Suggested corrective action")
    quote: str | None = Field(None, description="Verbatim excerpt from the source document")
    severity: int | None = Field(None, ge=1, le=10, description="Severity score from 1 (low) to 10 (high)")
    implication: str | None = Field(None, description="Potential impact of the identified issue")
    status: RiskStatus | None = Field(None, description="Status of the risk")
    vae_node_id: UUID | None = Field(None, description="The id of the vae node")

    @model_validator(mode="after")
    def non_nullable_fields_cannot_be_none(self) -> "UpdateRiskRequest":
        """Reject explicit null for columns that are NOT NULL in the database."""
        for field in _NON_NULLABLE_FIELDS:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"'{field}' cannot be explicitly set to null")
        return self

    model_config = {
        "populate_by_name": True,
    }
