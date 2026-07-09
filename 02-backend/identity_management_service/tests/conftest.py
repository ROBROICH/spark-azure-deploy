"""Test configuration and fixtures."""

import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from authentification.dependencies import get_current_user, get_oidc_client
from authentification.enums import OidcRoles
from authentification.models import OidcUserInfo
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("TEMPORAL_JOB_SERVICE_URL", "http://localhost:18011")


@pytest.fixture
def app() -> FastAPI:
    from src.main import app  # noqa: PLC0415

    return app


@pytest.fixture
def mock_user() -> OidcUserInfo:
    """A fully-populated user as would be returned by get_current_user."""
    return OidcUserInfo(
        sub="00000000-0000-0000-0000-000000000001",
        preferred_username="testuser",
        email="testuser@example.com",
        name="Test User",
        given_name="Test",
        family_name="User",
        realm_roles=[OidcRoles.ADMIN],
    )


@pytest.fixture
def mock_oidc_client(mock_user: OidcUserInfo) -> AsyncMock:
    mock_client = AsyncMock()
    mock_client.list_all_users.return_value = [mock_user]
    return mock_client


@pytest.fixture
async def authenticated_client(
    app: FastAPI,
    mock_user: OidcUserInfo,
    mock_oidc_client: AsyncMock,
) -> AsyncGenerator[AsyncClient]:
    """AsyncClient where get_current_user is overridden to return a valid user."""
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_oidc_client] = lambda: mock_oidc_client

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
async def unauthenticated_client(app: FastAPI) -> AsyncGenerator[AsyncClient]:
    """AsyncClient where get_current_user is overridden to return None (auth failed/disabled)."""
    app.dependency_overrides[get_current_user] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
