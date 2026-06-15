"""Unit tests for the fail-closed ClamAV / quarantine settings guards.

These tests verify that the document management service refuses to start in
production unless malware scanning is enabled, and that enabling ClamAV
requires a properly configured quarantine bucket and credentials.
"""

import pytest

from src.config.settings import Settings

_TEMPORAL = {
    "HOST": "localhost:7233",
    "TASK_QUEUE": "dms",
    "NAMESPACE": "default",
    "PLS_TASK_QUEUE": "pls",
    "S3_BUCKET_NAME": "bucket",
    "S3_ENDPOINT_URL": "http://localhost:9000",
    "S3_ACCESS_KEY_ID": "key",
    "S3_SECRET_ACCESS_KEY": "secret",
    "S3_REGION": "eu-central-1",
    "ENABLE_APPROVAL": True,
}


def _base_kwargs(**overrides):
    """Return a minimal-but-valid set of Settings kwargs (S3 provider)."""
    kwargs = {
        "SERVICE_NAME": "document_management_service",
        "OTEL_SERVICE_NAME": "dms",
        "OTEL_ENDPOINT": "http://localhost:4317",
        "CORS_ORIGINS": "http://localhost",
        "MAX_ZIP_EXTRACTION_SIZE_GB": 2,
        "MAX_SINGLE_ENTRY_SIZE_MB": 100,
        "MAX_ZIP_ENTRIES": 1000,
        "MAX_COMPRESSION_RATIO": 100,
        "DB_USER": "user",
        "DB_PASSWORD": "pw",
        "DB_HOST": "localhost",
        "DB_PORT": 5432,
        "DB_NAME": "dms",
        "BUCKET_NAME": "uploads",
        "DOC_STORE_PATH": "documents",
        "S3_ACCESS_KEY_ID": "key",
        "S3_SECRET_ACCESS_KEY": "secret",
        "S3_EXTERNAL_URL": "http://localhost:9000",
        "S3_ENDPOINT_URL": "http://localhost:9000",
        "S3_REGION": "eu-central-1",
        "CHECKPOINT_RETENTION_PERIOD_DAYS": 30,
        "PROJECT_LOGIC_SERVICE_URL": "http://pls",
        "TEMPORAL_JOB_SERVICE_URL": "http://tjs",
        "TEMPORAL": _TEMPORAL,
    }
    kwargs.update(overrides)
    return kwargs


def _clamav_enabled_kwargs(**overrides):
    """Base kwargs with ClamAV enabled and a fully configured quarantine."""
    return _base_kwargs(
        CLAMAV={"ENABLED": True},
        QUARANTINE_BUCKET_NAME="quarantine",
        QUARANTINE_S3_ACCESS_KEY_ID="qkey",
        QUARANTINE_S3_SECRET_ACCESS_KEY="qsecret",
        QUARANTINE_S3_ENDPOINT_URL="http://localhost:9000",
        **overrides,
    )


def test_production_requires_clamav_enabled():
    """Production must fail-closed when ClamAV is disabled."""
    with pytest.raises(ValueError, match="CLAMAV must be enabled in 'production' environment"):
        Settings(**_base_kwargs(ENV="production"))


def test_staging_requires_clamav_enabled():
    """Staging must fail-closed when ClamAV is disabled."""
    with pytest.raises(ValueError, match="CLAMAV must be enabled in 'staging' environment"):
        Settings(**_base_kwargs(ENV="staging"))


def test_testing_requires_clamav_enabled():
    """Testing environment must fail-closed when ClamAV is disabled."""
    with pytest.raises(ValueError, match="CLAMAV must be enabled in 'testing' environment"):
        Settings(**_base_kwargs(ENV="testing"))


def test_unknown_environment_requires_clamav_enabled():
    """Unknown environments must fail-closed when ClamAV is disabled (fail-safe)."""
    with pytest.raises(ValueError, match="CLAMAV must be enabled in 'custom-env' environment"):
        Settings(**_base_kwargs(ENV="custom-env"))


def test_production_with_clamav_enabled_is_valid():
    """Production boots when ClamAV and quarantine are correctly configured."""
    settings = Settings(**_clamav_enabled_kwargs(ENV="production"))
    assert settings.ENV == "production"
    assert settings.CLAMAV.ENABLED is True


def test_local_allows_clamav_disabled():
    """Local environment may run with scanning disabled."""
    settings = Settings(**_base_kwargs(ENV="local"))
    assert settings.CLAMAV.ENABLED is False


def test_development_allows_clamav_disabled():
    """Development environment may run with scanning disabled."""
    settings = Settings(**_base_kwargs(ENV="development"))
    assert settings.CLAMAV.ENABLED is False


def test_dev_allows_clamav_disabled():
    """Dev environment may run with scanning disabled."""
    settings = Settings(**_base_kwargs(ENV="dev"))
    assert settings.CLAMAV.ENABLED is False


def test_enabling_clamav_requires_quarantine_bucket():
    """Enabling ClamAV without a quarantine bucket must fail."""
    with pytest.raises(ValueError, match="QUARANTINE_BUCKET_NAME must be set"):
        Settings(
            **_base_kwargs(
                CLAMAV={"ENABLED": True},
                QUARANTINE_BUCKET_NAME="",
            )
        )


def test_enabling_clamav_requires_quarantine_credentials():
    """Enabling ClamAV without quarantine S3 credentials must fail."""
    with pytest.raises(ValueError, match="Missing quarantine S3 credentials"):
        Settings(
            **_base_kwargs(
                CLAMAV={"ENABLED": True},
                QUARANTINE_BUCKET_NAME="quarantine",
                QUARANTINE_S3_ACCESS_KEY_ID=None,
                QUARANTINE_S3_SECRET_ACCESS_KEY=None,
                QUARANTINE_S3_ENDPOINT_URL=None,
            )
        )


def test_fully_configured_clamav_is_valid():
    """A fully configured ClamAV + quarantine setup is accepted."""
    settings = Settings(**_clamav_enabled_kwargs())
    assert settings.QUARANTINE_BUCKET_NAME == "quarantine"
    assert settings.QUARANTINE_S3_ACCESS_KEY_ID == "qkey"


def test_clamav_rejects_same_clean_and_quarantine_storage():
    """Quarantine must not collapse to the clean upload bucket."""
    with pytest.raises(ValueError, match="Quarantine and clean storage cannot use the same endpoint and bucket"):
        Settings(
            **_base_kwargs(
                CLAMAV={"ENABLED": True},
                BUCKET_NAME="uploads",
                QUARANTINE_BUCKET_NAME="uploads",
                QUARANTINE_S3_ACCESS_KEY_ID="qkey",
                QUARANTINE_S3_SECRET_ACCESS_KEY="qsecret",
                S3_ENDPOINT_URL="http://localhost:9000",
                QUARANTINE_S3_ENDPOINT_URL="http://localhost:9000/",
            )
        )


def test_clamav_allows_same_endpoint_with_different_quarantine_bucket():
    """Separate buckets on the same S3 endpoint are valid quarantine isolation."""
    settings = Settings(
        **_base_kwargs(
            CLAMAV={"ENABLED": True},
            BUCKET_NAME="uploads",
            QUARANTINE_BUCKET_NAME="quarantine",
            QUARANTINE_S3_ACCESS_KEY_ID="qkey",
            QUARANTINE_S3_SECRET_ACCESS_KEY="qsecret",
            S3_ENDPOINT_URL="http://localhost:9000",
            QUARANTINE_S3_ENDPOINT_URL="http://localhost:9000/",
        )
    )
    assert settings.BUCKET_NAME == "uploads"
    assert settings.QUARANTINE_BUCKET_NAME == "quarantine"
