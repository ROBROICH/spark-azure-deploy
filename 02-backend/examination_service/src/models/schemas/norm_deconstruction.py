import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class NormDeconstructionCreate(BaseModel):
    jurabk: str
    paragraph: str
    deconstruction: dict[str, Any]


class NormDeconstructionResponse(BaseModel):
    id: uuid.UUID
    jurabk: str
    paragraph: str
    deconstruction: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}
