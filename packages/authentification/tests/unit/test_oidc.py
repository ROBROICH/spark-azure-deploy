from collections.abc import Callable

import httpx
import pytest
from authentification.oidc import KeycloakClient


async def test_keycloak_list_users_loads_managed_realm_roles_from_role_memberships() -> None:
    user_id = "00000000-0000-0000-0000-000000000001"
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.method == "POST" and request.url.path == "/realms/testing/protocol/openid-connect/token":
            return httpx.Response(200, json={"access_token": "token"})

        if request.method == "GET" and request.url.path == "/admin/realms/testing/users":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": user_id,
                        "username": "test.user@example.com",
                        "email": "test.user@example.com",
                        "firstName": "Test",
                        "lastName": "User",
                        "enabled": True,
                    }
                ],
            )

        if request.method == "GET" and request.url.path == "/admin/realms/testing/roles/admin/users":
            return httpx.Response(200, json=[])

        if request.method == "GET" and request.url.path == "/admin/realms/testing/roles/user/users":
            return httpx.Response(200, json=[{"id": user_id}])

        return httpx.Response(404)

    client = KeycloakClient(
        base_url="https://keycloak.example.com",
        realm="testing",
        client_id="spark-workflow-backend",
        client_secret="secret",
    )
    client._http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    try:
        users = await client.list_users()
    finally:
        await client.aclose()

    assert len(users) == 1
    assert users[0].sub == user_id
    assert users[0].realm_roles == ["user"]
    assert users[0].role == "user"
    assert [request.url.path for request in requests] == [
        "/realms/testing/protocol/openid-connect/token",
        "/admin/realms/testing/users",
        "/admin/realms/testing/roles/admin/users",
        "/admin/realms/testing/roles/user/users",
    ]
    assert all("/role-mappings/realm" not in request.url.path for request in requests)


async def test_keycloak_client_credentials_token_is_cached_between_calls() -> None:
    token_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/realms/testing/protocol/openid-connect/token":
            token_requests.append(request)
            return httpx.Response(200, json={"access_token": "token", "expires_in": 300})
        return httpx.Response(404)

    client = KeycloakClient(
        base_url="http://localhost:9090",
        realm="testing",
        client_id="spark-workflow-backend",
        client_secret="secret",
    )
    client._http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    try:
        assert await client.get_access_token() == "token"
        assert await client.get_access_token() == "token"
    finally:
        await client.aclose()

    assert len(token_requests) == 1


async def test_keycloak_token_error_keeps_runtime_error_contract() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid_client"})

    client = KeycloakClient(
        base_url="https://keycloak.example.com",
        realm="testing",
        client_id="spark-workflow-backend",
        client_secret="secret",
    )
    client._http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    try:
        with pytest.raises(RuntimeError, match="OIDC token request failed"):
            await client.get_access_token()
    finally:
        await client.aclose()


def _keycloak_handler(
    requests: list[tuple[str, str | None]], *, accepted_token: str
) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.url.path, request.headers.get("Authorization")))
        if request.url.path == "/realms/testing/protocol/openid-connect/token":
            token_number = sum(1 for path, _ in requests if path == request.url.path)
            return httpx.Response(200, json={"access_token": f"token-{token_number}", "expires_in": 300})
        if request.headers.get("Authorization") != f"Bearer {accepted_token}":
            return httpx.Response(401)
        return httpx.Response(200, json=[])

    return handler


async def test_keycloak_rejected_cached_token_is_invalidated_and_request_retried_once() -> None:
    requests: list[tuple[str, str | None]] = []
    client = KeycloakClient(
        base_url="https://keycloak.example.com",
        realm="testing",
        client_id="spark-workflow-backend",
        client_secret="secret",
    )
    client._http_client = httpx.AsyncClient(
        transport=httpx.MockTransport(_keycloak_handler(requests, accepted_token="token-2"))
    )

    try:
        assert await client.get_access_token() == "token-1"
        assert await client.list_users() == []
        assert await client.get_access_token() == "token-2"
    finally:
        await client.aclose()

    assert requests == [
        ("/realms/testing/protocol/openid-connect/token", None),
        ("/admin/realms/testing/users", "Bearer token-1"),
        ("/realms/testing/protocol/openid-connect/token", None),
        ("/admin/realms/testing/users", "Bearer token-2"),
    ]


async def test_keycloak_second_401_propagates_without_another_retry() -> None:
    requests: list[tuple[str, str | None]] = []
    client = KeycloakClient(
        base_url="https://keycloak.example.com",
        realm="testing",
        client_id="spark-workflow-backend",
        client_secret="secret",
    )
    client._http_client = httpx.AsyncClient(
        transport=httpx.MockTransport(_keycloak_handler(requests, accepted_token="none"))
    )

    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.list_users()
    finally:
        await client.aclose()

    assert [path for path, _ in requests] == [
        "/realms/testing/protocol/openid-connect/token",
        "/admin/realms/testing/users",
        "/realms/testing/protocol/openid-connect/token",
        "/admin/realms/testing/users",
    ]
