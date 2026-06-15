from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SnakeCaseModel(BaseModel):
    """Shared API model config: snake_case schema with camelCase input compatibility."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


def accepts_camel(field_name: str, **kwargs: Any) -> Any:
    return Field(
        validation_alias=AliasChoices(field_name, to_camel(field_name)),
        **kwargs,
    )
