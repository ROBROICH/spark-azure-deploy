from enum import Enum

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from event_logging.enums import LogLevel


class Environment(str, Enum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"


class LoggingSettings(BaseSettings):
    model_config = SettingsConfigDict()

    log_level: LogLevel = Field(default=LogLevel.INFO, validation_alias="LOG_LEVEL")

    @field_validator("log_level", mode="before")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        normalized = value.lower()
        return {"warning": "warn", "critical": "fatal"}.get(normalized, normalized)

    ecs_version: str = Field(
        default="8.11.0",
        description="Version of the Elastic Common Schema specification",
    )
    env: Environment | str = Field(
        default=Environment.PRODUCTION,
        validation_alias="ENV",
    )

    @property
    def pretty_print(self) -> bool:
        """Enable pretty print for development environments."""
        return self.env in (Environment.DEVELOPMENT, "development", "dev")
