"""configuration definition"""

from db_services_shared.config.settings import CommonSettings, PostgresConfig
from pydantic import (
    BaseModel,
    HttpUrl,
)
from pydantic_settings import SettingsConfigDict


class TemporalConfig(BaseModel):
    host: str = "localhost:7233"


class Settings(CommonSettings):
    """main app config"""

    db: PostgresConfig = PostgresConfig(name="rechtsaenderungsmonitoring-db")
    temporal: TemporalConfig = TemporalConfig()

    gesetze_normen_url: HttpUrl = "http://gesetze-normen-db-test.gesetze-normen-db.svc.cluster.local:8000"

    model_config = SettingsConfigDict(**CommonSettings.model_config)


app_config = Settings()
