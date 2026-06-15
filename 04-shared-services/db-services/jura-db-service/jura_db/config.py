"""configuration definition"""

from db_services_shared.config.settings import CommonSettings, PostgresConfig
from db_services_shared.llm.embeddings import ChunkingConfig
from pydantic import HttpUrl
from pydantic_settings import SettingsConfigDict


class Settings(CommonSettings):
    """main app config"""
    db: PostgresConfig = PostgresConfig(name="jura-db")

    rii_base_document_url: str = "http://www.rechtsprechung-im-internet.de/jportal/docs/bsjrs"
    gesetze_normen_url: HttpUrl = HttpUrl("http://localhost:8000")
    chunking: ChunkingConfig = ChunkingConfig()

    model_config = SettingsConfigDict(**CommonSettings.model_config)


app_config = Settings()
