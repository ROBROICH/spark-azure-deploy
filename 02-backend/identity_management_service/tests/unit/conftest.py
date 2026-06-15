import pytest
from authentification.config import AuthSettings
from authentification.enums import AuthMode


@pytest.fixture(autouse=True)
def patch_auth_settings(monkeypatch):
    fake = AuthSettings(
        base_url="https://auth.test",
        realm="dev",
        audience="test-backend",
        spice_db_endpoint="127.0.0.1:50051",
        spice_db_token="test-spicedb-token",
        mode=AuthMode.OPTIONAL_VERIFY_DRY_RUN,
    )

    monkeypatch.setattr(
        "authentification.config.auth_settings",
        lambda: fake,
    )
    monkeypatch.setattr(
        "authentification.dependencies.auth_settings",
        lambda: fake,
    )
    monkeypatch.setattr(
        "authentification.logger.auth_settings",
        lambda: fake,
    )
