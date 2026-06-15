"""Pydantic schemas for Objection Management Service."""

from enum import Enum as PyEnum
from uuid import UUID

from pydantic import BaseModel


class BeteiligungTyp(PyEnum):
    STELLUNGNAHME = "stellungnahme"
    NATURSCHUTZ = "naturschutz"
    EINWENDUNG = "einwendung"


class ExtractionStatus(PyEnum):
    SUCCESS = "success"
    LOADING = "loading"
    FAILED = "failed"
    PROMPT_INJECTION_ERROR = "prompt_injection_error"


class ArgumentStatus(PyEnum):
    OPEN = "open"
    SUBTOPIC_REVIEWED = "subtopic_reviewed"
    DONE = "done"


class ClassificationStatus(PyEnum):
    LOADING = "loading"
    DONE = "done"
    FAILED = "failed"


class FileIdRequest(BaseModel):
    file_id: UUID


class FileIdResponse(BaseModel):
    file_id: UUID


class ErwiderungImportResponse(BaseModel):
    updated: int
    skipped: int
