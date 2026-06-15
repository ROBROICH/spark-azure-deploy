"""configuration definition"""

from enum import StrEnum

from db_services_shared.config.settings import CommonSettings, PostgresConfig
from db_services_shared.llm.embeddings import ChunkingConfig
from pydantic import (
    BaseModel,
    HttpUrl,
)
from pydantic_settings import SettingsConfigDict


class Source(StrEnum):
    """toggles for different data sources"""

    DIP_DRUCK = "dip_druck"

class Temporal(BaseModel):
    """Temporal configuration"""

    host: str = "localhost:7233"

class Settings(CommonSettings):
    """main app config"""
    SERVICE_NAME: str = "gesetzesbegruendung-db-service"
    chunking: ChunkingConfig = ChunkingConfig()
    db: PostgresConfig = PostgresConfig(name="begruendungen-db")

    temporal: Temporal = Temporal()

    gesetze_normen_url: HttpUrl = HttpUrl("http://localhost:8000")

    model_config = SettingsConfigDict(**CommonSettings.model_config)

app_config = Settings()
