import pytest
from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.connection_config import TemporalConfig, TemporalHostConfig

VALID_ENV = {
    "TEMPORAL_HOST": "localhost:7233",
    "TEMPORAL_S3_BUCKET_NAME": "temporal-payloads",
    "TEMPORAL_S3_ENDPOINT_URL": "http://localhost:9000",
    "TEMPORAL_S3_ACCESS_KEY_ID": "access-key-value",
    "TEMPORAL_S3_SECRET_ACCESS_KEY": "secret-key-value",
    "TEMPORAL_S3_REGION": "eu-west-1",
}
EXPECTED_THREAD_MAX_WORKERS = 8


class _WorkerSettings(BaseSettings):
    TEMPORAL: TemporalConfig

    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=True,
    )


class _ApiSettings(BaseSettings):
    temporal: TemporalHostConfig = TemporalHostConfig(HOST="localhost:7233")

    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        extra="ignore",
        case_sensitive=False,
    )


class _ExtendedTemporalConfig(TemporalConfig):
    THREAD_MAX_WORKERS: int = Field(default=4)


class _ExtendedWorkerSettings(BaseSettings):
    TEMPORAL: _ExtendedTemporalConfig

    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=True,
    )


@pytest.fixture
def worker_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)


@pytest.mark.usefixtures("worker_env")
def test_reads_temporal_env_block() -> None:
    settings = _WorkerSettings()  # pyrefly: ignore[missing-argument]

    assert settings.TEMPORAL.HOST == "localhost:7233"
    assert settings.TEMPORAL.S3_BUCKET_NAME == "temporal-payloads"
    assert settings.TEMPORAL.S3_ENDPOINT_URL == "http://localhost:9000"
    assert settings.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value() == "access-key-value"
    assert settings.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value() == "secret-key-value"
    assert settings.TEMPORAL.S3_REGION == "eu-west-1"


@pytest.mark.usefixtures("worker_env")
def test_access_keys_are_masked_in_repr() -> None:
    settings = _WorkerSettings()  # pyrefly: ignore[missing-argument]

    assert "access-key-value" not in repr(settings)
    assert "secret-key-value" not in repr(settings)
    assert "access-key-value" not in str(settings.model_dump())


@pytest.mark.parametrize(
    "key",
    [
        "TEMPORAL_HOST",
        "TEMPORAL_S3_BUCKET_NAME",
        "TEMPORAL_S3_ENDPOINT_URL",
        "TEMPORAL_S3_ACCESS_KEY_ID",
        "TEMPORAL_S3_SECRET_ACCESS_KEY",
    ],
)
@pytest.mark.usefixtures("worker_env")
def test_rejects_empty_required_values(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    monkeypatch.setenv(key, "")

    with pytest.raises(ValidationError):
        _WorkerSettings()  # pyrefly: ignore[missing-argument]


@pytest.mark.usefixtures("worker_env")
def test_region_must_be_set_but_may_be_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TEMPORAL_S3_REGION", "")
    assert _WorkerSettings().TEMPORAL.S3_REGION == ""  # pyrefly: ignore[missing-argument]

    monkeypatch.delenv("TEMPORAL_S3_REGION")
    with pytest.raises(ValidationError):
        _WorkerSettings()  # pyrefly: ignore[missing-argument]


@pytest.mark.usefixtures("worker_env")
def test_component_subclass_adds_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TEMPORAL_THREAD_MAX_WORKERS", str(EXPECTED_THREAD_MAX_WORKERS))

    settings = _ExtendedWorkerSettings()  # pyrefly: ignore[missing-argument]

    assert settings.TEMPORAL.THREAD_MAX_WORKERS == EXPECTED_THREAD_MAX_WORKERS
    assert settings.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value() == "access-key-value"


def test_host_config_default_and_case_insensitive_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TEMPORAL_HOST", raising=False)
    assert _ApiSettings().temporal.HOST == "localhost:7233"

    monkeypatch.setenv("TEMPORAL_HOST", "temporal-frontend:7233")
    assert _ApiSettings().temporal.HOST == "temporal-frontend:7233"
