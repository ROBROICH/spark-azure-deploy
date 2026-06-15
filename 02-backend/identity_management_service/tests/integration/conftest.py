"""Integration test fixtures.

Requires the authentification docker-compose to be running:
    cd 02-backend/authentification && docker compose up -d

Environment variables (set via .env or shell):
    AUTH_BASE_URL=http://localhost:9090
    AUTH_REALM=master
    AUTH_AUDIENCE=test-client
    AUTH_SPICE_DB_ENDPOINT=localhost:50051
    AUTH_SPICE_DB_TOKEN=dev-secret
    AUTH_SPICE_DB_INSECURE=true
    AUTH_ALLOW_MISSING_JWKS=true
"""

import os
import shutil
from collections.abc import AsyncGenerator, AsyncIterator

# Must be set before any authentification imports (auth_settings() runs at module level).
_INTEGRATION_ENV = {
    "AUTH_BASE_URL": "http://localhost:9090",
    "AUTH_REALM": "master",
    "AUTH_AUDIENCE": "test-client",
    "AUTH_SPICE_DB_ENDPOINT": "localhost:50051",
    "AUTH_SPICE_DB_TOKEN": "dev-secret",
    "AUTH_SPICE_DB_INSECURE": "true",
    "AUTH_ALLOW_MISSING_JWKS": "true",
    "PSYCOPG_IMPL": "python",
    "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:5432/test_db",
}
for _k, _v in _INTEGRATION_ENV.items():
    os.environ[_k] = _v

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import requests  # noqa: E402
from asgi_lifespan import LifespanManager  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from py_pglite.config import PGliteConfig  # noqa: E402
from py_pglite.sqlalchemy.manager_async import SQLAlchemyAsyncPGliteManager  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker  # noqa: E402

import src.models.db.database as db_module  # noqa: E402
from src.models.db_models import Base  # noqa: E402

_KEYCLOAK_CLIENT = "test-client"
_KEYCLOAK_USER = "identity-test-user"
_KEYCLOAK_PASSWORD = "password123"


@pytest.fixture(scope="session")
def issuer_url() -> str:
    base_url = os.environ["AUTH_BASE_URL"]
    realm = os.environ["AUTH_REALM"]
    return base_url + "/realms/" + realm


@pytest.fixture(scope="session")
def keycloak_admin_token(issuer_url) -> str:
    """Admin token from the Keycloak master realm."""
    resp = requests.post(
        f"{issuer_url}/protocol/openid-connect/token",
        data={
            "client_id": "admin-cli",
            "username": "admin",
            "password": "admin",
            "grant_type": "password",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def keycloak_ensure_test_setup(keycloak_admin_token: str, issuer_url: str) -> None:
    """Idempotently creates the test-client and test user in Keycloak master realm."""
    base_url = os.environ["AUTH_BASE_URL"]
    headers = {
        "Authorization": f"Bearer {keycloak_admin_token}",
        "Content-Type": "application/json",
    }

    # Ensure client exists
    existing = requests.get(
        f"{base_url}/admin/realms/master/clients?clientId={_KEYCLOAK_CLIENT}",
        headers=headers,
        timeout=10,
    )
    existing.raise_for_status()
    if not existing.json():
        requests.post(
            f"{base_url}/admin/realms/master/clients",
            json={
                "clientId": _KEYCLOAK_CLIENT,
                "enabled": True,
                "publicClient": True,
                "directAccessGrantsEnabled": True,
                "redirectUris": ["*"],
            },
            headers=headers,
            timeout=10,
        ).raise_for_status()
        existing = requests.get(
            f"{base_url}/admin/realms/master/clients?clientId={_KEYCLOAK_CLIENT}",
            headers=headers,
            timeout=10,
        )
        existing.raise_for_status()

    client_id = existing.json()[0]["id"]

    # Ensure audience mapper exists so AUTH_AUDIENCE claim is present in the token
    mappers = requests.get(
        f"{base_url}/admin/realms/master/clients/{client_id}/protocol-mappers/models",
        headers=headers,
        timeout=10,
    )
    mappers.raise_for_status()
    if not any(m["name"] == "audience-for-tests" for m in mappers.json()):
        requests.post(
            f"{base_url}/admin/realms/master/clients/{client_id}/protocol-mappers/models",
            json={
                "name": "audience-for-tests",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-audience-mapper",
                "config": {
                    "included.client.audience": _KEYCLOAK_CLIENT,
                    "access.token.claim": "true",
                    "id.token.claim": "false",
                    "userinfo.token.claim": "false",
                },
            },
            headers=headers,
            timeout=10,
        ).raise_for_status()

    # Ensure user exists
    user_check = requests.get(
        f"{base_url}/admin/realms/master/users?username={_KEYCLOAK_USER}",
        headers=headers,
        timeout=10,
    )
    user_check.raise_for_status()
    if not user_check.json():
        requests.post(
            f"{base_url}/admin/realms/master/users",
            json={
                "username": _KEYCLOAK_USER,
                "enabled": True,
                "email": f"{_KEYCLOAK_USER}@example.com",
                "firstName": "Synthetic",
                "lastName": "User",
                "credentials": [{"type": "password", "value": _KEYCLOAK_PASSWORD, "temporary": False}],
            },
            headers=headers,
            timeout=10,
        ).raise_for_status()


@pytest.fixture(scope="session")
def real_user_token(keycloak_ensure_test_setup: None, issuer_url: str) -> str:
    """Real JWT for the test user from Keycloak."""
    resp = requests.post(
        f"{issuer_url}/protocol/openid-connect/token",
        data={
            "client_id": _KEYCLOAK_CLIENT,
            "username": _KEYCLOAK_USER,
            "password": _KEYCLOAK_PASSWORD,
            "grant_type": "password",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def pglite() -> AsyncIterator[SQLAlchemyAsyncPGliteManager]:
    if not shutil.which("npm"):
        pytest.skip("npm not available (required by py-pglite)")
    manager = SQLAlchemyAsyncPGliteManager(PGliteConfig())
    manager.start()
    await manager.wait_for_ready()
    yield manager
    await manager.stop()


@pytest_asyncio.fixture(scope="session")
async def async_engine(pglite: SQLAlchemyAsyncPGliteManager) -> AsyncIterator[AsyncEngine]:
    """
    Initializes the async engine.
    """
    async_engine = pglite.get_engine()

    db_module.async_engine = async_engine
    db_module.AsyncSessionLocal = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    yield async_engine


@pytest.fixture(scope="function")
def async_session_maker(async_engine):
    """
    Initializes the async session maker.
    """
    return async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


@pytest_asyncio.fixture(scope="function")
async def db_session(async_session_maker, db_schema):
    """
    Provides a clean session for each test.
    """
    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def db_schema(async_engine):
    """
    Initializes the database schema.
    """
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def integration_client(app) -> AsyncGenerator[AsyncClient]:
    """AsyncClient wired to the real app with no dependency overrides."""
    async with (
        LifespanManager(app),
        AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client,
    ):
        yield client
