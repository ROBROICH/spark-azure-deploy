"""Pydantic schemas for FPP service API."""

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class FPPRequestStatus(StrEnum):
    """Status of an FPP request."""

    RECEIVED = "RECEIVED"
    PROCESSING = "IMPORTING"
    COMPLETED = "IMPORTED"
    FAILED = "FAILED"


class FPPFileType(StrEnum):
    """Type of file attached to an FPP request."""

    PLANUNTERLAGEN = "PLANUNTERLAGEN"
    ERGAENZENDE_UNTERLAGEN = "ERGAENZENDE_UNTERLAGEN"


class FPPFileInput(BaseModel):
    """File input for FPP project creation request."""

    file_type: FPPFileType = Field(..., description="Type of file")
    file_url: str = Field(..., description="URL to download the file")
    file_name: str | None = Field(None, description="Optional file name")

    @field_validator("file_url")
    @classmethod
    def validate_file_url(cls, v: str) -> str:
        """
        Validate file URL for security compliance.

        Security checks:
        - HTTPS only
        - Block private IP addresses
        - Domain must be in allowlist
        - No credentials in URL
        """
        from src.utils.url_validator import validate_file_url

        return validate_file_url(v)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "file_type": "PLANUNTERLAGEN",
                    "file_url": "https://example.com/files/plan.pdf",
                    "file_name": "Planunterlagen.pdf",
                }
            ]
        }
    }


class FPPProjectRequest(BaseModel):
    """Request to create a project from FPP platform."""

    request_id: UUID = Field(..., description="Unique request ID from FPP platform")
    internal_project_id: str = Field(..., description="Internal project number (Aktenzeichen)")
    name: str = Field(..., description="Project name (Vorhaben Name)")
    xml: str = Field(
        ...,
        max_length=10_000_000,
        description="Raw XML data from FPP (max 10MB to prevent resource exhaustion)",
    )
    files: list[FPPFileInput] = Field(default_factory=list, description="List of file URLs")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "request_id": "123e4567-e89b-12d3-a456-426614174000",
                    "internal_project_id": "FPP-2025-001",
                    "name": "Neubau Bundesstraße B123",
                    "xml": "<fpp>...</fpp>",
                    "files": [
                        {
                            "file_type": "PLANUNTERLAGEN",
                            "file_url": "https://example.com/files/plan.pdf",
                        }
                    ],
                }
            ]
        }
    }


class FPPFileResponse(BaseModel):
    """File information in response."""

    id: UUID
    file_type: FPPFileType
    file_url: str
    file_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FPPProjectResponse(BaseModel):
    """Response after creating a project from FPP."""

    request_id: UUID = Field(..., description="Request ID")
    internal_project_id: str = Field(..., description="Internal project number")
    name: str = Field(..., description="Project name")
    status: FPPRequestStatus = Field(..., description="Request status")
    created_at: datetime = Field(..., description="Request creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {"from_attributes": True}


class FPPRequestDetail(BaseModel):
    """Detailed FPP request information."""

    request_id: UUID
    internal_project_id: str
    name: str
    entry_date: date
    xml: str
    state: str | None
    company: str | None
    address_combined: str | None
    street: str | None
    house_number: str | None
    plz: str | None
    location: str | None
    country: str | None
    email: str | None
    phone: str | None
    fax: str | None
    project_id: UUID | None
    status: FPPRequestStatus
    files: list[FPPFileResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
