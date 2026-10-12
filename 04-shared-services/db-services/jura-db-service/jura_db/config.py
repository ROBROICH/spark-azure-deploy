"""configuration definition"""

from db_services_shared.config.settings import CommonSettings, PostgresConfig
from db_services_shared.llm.embeddings import ChunkingConfig
from pydantic import HttpUrl, field_validator
from pydantic_settings import SettingsConfigDict


class Settings(CommonSettings):
    """main app config"""
    db: PostgresConfig = PostgresConfig(name="jura-db")

    rii_base_document_url: str = "https://www.rechtsprechung-im-internet.de/jportal/docs/bsjrs"
    gesetze_normen_url: HttpUrl = HttpUrl("http://localhost:8000")
    chunking: ChunkingConfig = ChunkingConfig()

    model_config = SettingsConfigDict(**CommonSettings.model_config)

    @field_validator("rii_base_document_url", mode="after")
    @staticmethod
    def require_https(value: str) -> str:
        """downloaded archives are executed by the parser pipeline, so require tls"""
        if not value.startswith("https://"):
            raise ValueError(f"rii_base_document_url must use https, got {value}")
        return value.rstrip("/")


app_config = Settings()
