import os
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import requests
from authentification.auth import AuthClient
from authentification.config import AuthSettings
from authentification.enums import AuthMode, OidcRoles
from authentification.oidc import KeycloakClient
from authentification.verifier import KeycloakVerifier

TEST_OIDC_ADMIN_USERNAME = os.getenv(
    "AUTH_TEST_OIDC_ADMIN_USERNAME",
    "auth-test-admin",
)
TEST_OIDC_CLIENT = "auth-test-client"
TEST_OIDC_USER = "auth-test-user"
TEST_OIDC_REALM = "master"
REQUEST_TIMEOUT = 15.0


def _required_secret(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        pytest.skip(f"{name} must be set for provider qualification")
    return value


@pytest.fixture(scope="session")
def oidc_admin_password() -> str:
    return _required_secret("AUTH_TEST_OIDC_ADMIN_PASSWORD")


@pytest.fixture(scope="session")
def oidc_test_user_password() -> str:
    return _required_secret("AUTH_TEST_OIDC_USER_PASSWORD")


@pytest.fixture(scope="session")
def spicedb_token() -> str:
    return _required_secret("AUTH_TEST_SPICEDB_TOKEN")


@pytest.fixture
def auth_settings(spicedb_token: str) -> AuthSettings:
    oidc_port = os.getenv("AUTH_TEST_OIDC_PORT", "18080")
    spicedb_port = os.getenv("AUTH_TEST_SPICEDB_PORT", "15051")
    return AuthSettings(
        mode=AuthMode.STRICT,
        base_url=f"http://127.0.0.1:{oidc_port}",
        realm=TEST_OIDC_REALM,
        audience=TEST_OIDC_CLIENT,
        spice_db_endpoint=f"127.0.0.1:{spicedb_port}",
        spice_db_token=spicedb_token,
        spice_db_insecure=True,
        client_id="admin-cli",
    )


@pytest.fixture
async def integration_auth_client(auth_settings: AuthSettings) -> AuthClient:
    return AuthClient(
        endpoint=auth_settings.spice_db_endpoint,
        token=auth_settings.spice_db_token,
        insecure=auth_settings.spice_db_insecure,
    )


@pytest.fixture
async def integration_verifier(auth_settings: AuthSettings) -> KeycloakVerifier:
    return KeycloakVerifier(
        base_url=auth_settings.base_url,
        realm=auth_settings.realm,
        audience=auth_settings.audience,
        jwks_url=auth_settings.jwks_url,
        algorithms=auth_settings.algorithms,
        auth_mode=auth_settings.mode,
    )


@pytest.fixture
async def integration_oidc_client(
    auth_settings: AuthSettings,
    oidc_admin_password: str,
) -> AsyncGenerator[KeycloakClient, Any]:
    client = KeycloakClient(
        base_url=auth_settings.base_url,
        realm=auth_settings.realm,
        client_id=auth_settings.client_id,
        client_secret=None,
        password=oidc_admin_password,
        username=TEST_OIDC_ADMIN_USERNAME,
        timeout=REQUEST_TIMEOUT,
    )
    yield client
    await client.aclose()


@pytest.fixture
def oidc_admin_token(
    integration_verifier: KeycloakVerifier,
    oidc_admin_password: str,
) -> str:
    response = requests.post(
        integration_verifier.issuer_url + "/protocol/openid-connect/token",
        data={
            "client_id": "admin-cli",
            "username": TEST_OIDC_ADMIN_USERNAME,
            "password": oidc_admin_password,
            "grant_type": "password",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["access_token"]


@pytest.fixture
def oidc_test_user_token(
    integration_verifier: KeycloakVerifier,
    ensure_oidc_test_user: None,
    oidc_test_user_password: str,
) -> str:
    response = requests.post(
        integration_verifier.issuer_url + "/protocol/openid-connect/token",
        data={
            "client_id": TEST_OIDC_CLIENT,
            "username": TEST_OIDC_USER,
            "password": oidc_test_user_password,
            "grant_type": "password",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["access_token"]


@pytest.fixture
def ensure_oidc_test_user(
    oidc_admin_token: str,
    integration_verifier: KeycloakVerifier,
    oidc_test_user_password: str,
) -> None:
    headers = {
        "Authorization": f"Bearer {oidc_admin_token}",
        "Content-Type": "application/json",
    }
    keycloak_url = integration_verifier.base_url
    clients_url = f"{keycloak_url}/admin/realms/{TEST_OIDC_REALM}/clients"

    client_response = requests.get(
        f"{clients_url}?clientId={TEST_OIDC_CLIENT}",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    client_response.raise_for_status()
    if not client_response.json():
        create_client = requests.post(
            clients_url,
            json={
                "clientId": TEST_OIDC_CLIENT,
                "enabled": True,
                "publicClient": True,
                "directAccessGrantsEnabled": True,
                "redirectUris": ["http://127.0.0.1/callback"],
            },
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        create_client.raise_for_status()
        client_response = requests.get(
            f"{clients_url}?clientId={TEST_OIDC_CLIENT}",
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        client_response.raise_for_status()

    client_id = client_response.json()[0]["id"]
    mappers_url = f"{clients_url}/{client_id}/protocol-mappers/models"
    mappers_response = requests.get(
        mappers_url,
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    mappers_response.raise_for_status()
    if not any(mapper["name"] == "auth-test-audience" for mapper in mappers_response.json()):
        create_mapper = requests.post(
            mappers_url,
            json={
                "name": "auth-test-audience",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-audience-mapper",
                "config": {
                    "included.client.audience": TEST_OIDC_CLIENT,
                    "access.token.claim": "true",
                    "id.token.claim": "false",
                    "userinfo.token.claim": "false",
                },
            },
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        create_mapper.raise_for_status()

    users_url = f"{keycloak_url}/admin/realms/{TEST_OIDC_REALM}/users"
    user_response = requests.get(
        f"{users_url}?username={TEST_OIDC_USER}&exact=true",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    user_response.raise_for_status()
    if not user_response.json():
        create_user = requests.post(
            users_url,
            json={
                "username": TEST_OIDC_USER,
                "enabled": True,
                "credentials": [
                    {
                        "type": "password",
                        "value": oidc_test_user_password,
                        "temporary": False,
                    }
                ],
            },
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        create_user.raise_for_status()
        user_response = requests.get(
            f"{users_url}?username={TEST_OIDC_USER}&exact=true",
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        user_response.raise_for_status()

    user_id = user_response.json()[0]["id"]
    role_url = f"{keycloak_url}/admin/realms/{TEST_OIDC_REALM}/roles/{OidcRoles.USER}"
    role_response = requests.get(role_url, headers=headers, timeout=REQUEST_TIMEOUT)
    if role_response.status_code == requests.codes.not_found:
        create_role = requests.post(
            f"{keycloak_url}/admin/realms/{TEST_OIDC_REALM}/roles",
            json={"name": OidcRoles.USER},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        create_role.raise_for_status()
        role_response = requests.get(role_url, headers=headers, timeout=REQUEST_TIMEOUT)
    role_response.raise_for_status()
    role = role_response.json()

    mappings_url = f"{users_url}/{user_id}/role-mappings/realm"
    mappings_response = requests.get(
        mappings_url,
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    mappings_response.raise_for_status()
    if not any(mapping["name"] == OidcRoles.USER for mapping in mappings_response.json()):
        assign_role = requests.post(
            mappings_url,
            json=[role],
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        assign_role.raise_for_status()
