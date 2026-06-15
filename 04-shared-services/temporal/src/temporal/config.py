import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    """
    Automatically reads from environment variables or .env file.
    """
    model_config = SettingsConfigDict(
        env_prefix="AUTH_",
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def auth_settings() -> AuthSettings:
    """
    Cached factory for AuthSettings.

    The settings object is created only once per process.
    """
    return AuthSettings()  # type: ignore
