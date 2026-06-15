"""configuration definition"""

import os
from pathlib import Path
from logging import getLevelNamesMapping
from typing import Literal, Optional  # noqa: F401 (type alias as string)

from pydantic import BaseModel, Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# wrap as string, to parameterise Literal
# https://typing.python.org/en/latest/spec/literal.html#parameters-at-runtime
LogLevel = f"Literal{list(getLevelNamesMapping().keys())}"


class PostgresConfig(BaseModel):
    """database config"""

    user: str = "postgres"
    name: str = ""
    password: str = "postgres"
    host: str = "localhost"
    port: int = 15432
    pool_size: int = Field(10, alias='poolsize')
    max_overflow: int = Field(5, alias='maxoverflow')

    def dsn_factory(self, is_async: bool) -> str:
        """construct postgres dsn out of the individual config values"""
        return PostgresDsn(
            f"postgresql+{'asyncpg' if is_async else 'psycopg'}://"
            + f"{self.user}:{self.password}@{self.host}"
            + f":{self.port}/{self.name}"
        ).encoded_string()

    @property
    def dsn(self) -> str:
        """data source name for synchronous connections"""
        return self.dsn_factory(is_async=False)

    @property
    def async_dsn(self) -> str:
        """data source name for asynchronous connections"""
        return self.dsn_factory(is_async=True)


class CommonSettings(BaseSettings):
    """main pipeline config"""
    SERVICE_NAME: str = "db-services"
    # pyrefly: ignore [not-a-type]
    log_level: LogLevel = "INFO"

    BACKEND_CORS_ORIGINS: str | list[str] = ""
    ALLOWED_HTTP_METHODS: list[str] = [
        "POST",
        "OPTIONS",
    ]

    db: PostgresConfig = PostgresConfig()
    cache_dir: Path = Path("cached")

    @field_validator("BACKEND_CORS_ORIGINS", mode="after")
    @staticmethod
    def split_origins(value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
        env_nested_delimiter="_",
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_file_encoding="utf-8",
    )


CommonSettings.model_rebuild()
