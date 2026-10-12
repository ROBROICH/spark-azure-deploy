from pydantic import AliasChoices, AliasGenerator, BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


def _validation_alias(field_name: str) -> str | AliasChoices:
    camel_name = to_camel(field_name)
    if camel_name == field_name:
        return field_name
    return AliasChoices(field_name, camel_name)


CAMEL_WIRE_ALIASES = AliasGenerator(
    validation_alias=_validation_alias,
)


class CamelWireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=CAMEL_WIRE_ALIASES,
        validate_by_alias=True,
        validate_by_name=True,
    )
