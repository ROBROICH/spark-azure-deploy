from uuid import UUID

from pydantic import BaseModel
from pydantic.alias_generators import to_camel


class TypeResponse(BaseModel):
    """Pydantic model for simple type mappings."""

    id: UUID
    name: str

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ProjectStatusResponse(BaseModel):
    """Pydantic model for project status with internal_name."""

    id: UUID
    name: str
    internal_name: str

    model_config = {
        "alias_generator": to_camel,
        "from_attributes": True,
        "populate_by_name": True,
    }
