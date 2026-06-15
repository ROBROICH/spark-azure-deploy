import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class InternalAuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AUTH_",
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    internal_api_key: str = Field(default="")


@lru_cache
def internal_auth_settings() -> InternalAuthSettings:
    return InternalAuthSettings()
