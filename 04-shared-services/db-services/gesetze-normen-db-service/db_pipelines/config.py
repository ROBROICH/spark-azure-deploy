"""configuration definition"""

import json
from functools import cached_property
from logging import getLevelNamesMapping
from pathlib import Path
from typing import Literal, Any  # noqa: F401 (type alias as string)

from db_services_shared.config.settings import CommonSettings, PostgresConfig
from pydantic import BaseModel, Field, HttpUrl, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from db_pipelines.constants import Bundesland

# wrap as string, to parameterise Literal
# https://typing.python.org/en/latest/spec/literal.html#parameters-at-runtime
LogLevel = f"Literal{list(getLevelNamesMapping().keys())}"


class BaseRelevantLaws(BaseSettings):
    """Base class for relevant laws list"""

    parser: str = Field(..., description="Name of the parser class")
    extra: dict[str, Any] = Field(default_factory=dict, description="Additional keyword arguments for the parser")
    base_url: HttpUrl

    gesetz: list[str] | None = None
    verordnung: list[str] | None = None
    richtlinie: list[str] | None = None
    verwaltungsvorschrift: list[str] | None = None
    technische_norm: list[str] | None = None


class StateRelevantLaws(BaseRelevantLaws):
    """Relevant state law (includes state name)"""

    name: Bundesland


class RelevantLaws(BaseSettings):
    """config for case-relevant laws"""

    eu: BaseRelevantLaws | None = None
    bund: BaseRelevantLaws | None = None
    # supports both single bundesland (legacy) and multiple
    bundesland: StateRelevantLaws | None = None
    bundeslaender: list[StateRelevantLaws] | None = None


class PipelineConfig(BaseModel):
    """ingestion pipeline configuration"""

    json_location: Path = Field(
        Path("pipeline_configs/pipeline_config.json"),
    )

    # use computed field to load lazily (service doesn't need it)
    @computed_field
    @cached_property
    def relevant_laws(self) -> RelevantLaws:
        """
        a dictionary containing valid Sources
        with a corresponding list of relevant law slugs
        to fetch from the Source's endpoint.
        """
        with open(self.json_location) as f:
            raw = json.load(f)
        return RelevantLaws(**raw)


PipelineConfig.model_rebuild()


class Settings(CommonSettings):
    """main pipeline config"""

    SERVICE_NAME: str = "Gesetze & Normen DB / Paragraphensuche"
    db: PostgresConfig = PostgresConfig(name="gesetze-normen")

    model_config = SettingsConfigDict(**CommonSettings.model_config)

Settings.model_rebuild()

app_config = Settings()
