from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelConfig(BaseModel):
    """Shared config for camelCase aliases and ORM mode."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
    )


class SuccessResponse(BaseModel):
    success: bool = Field(True, description="Indicates whether the operation was successful")
