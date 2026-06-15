from abc import ABC, abstractmethod
from collections.abc import Sequence
from http import HTTPStatus
from textwrap import dedent
from typing import Any, override
from urllib.parse import quote

import httpx

from authentification.enums import OidcRoles
from authentification.models import OidcUserInfo


class OidcClient(ABC):
    """Base async OIDC client for token acquisition and provider API calls."""

    _http_client: httpx.AsyncClient | None = None

    def __init__(
        self,
        base_url: str,
        realm: str,
        client_id: str,
        auth_realm: str | None = None,
        client_secret: str | None = None,
        username: str | None = None,
        password: str | None = None,
        *,
        timeout: float = 10.0,
    ) -> None:
        """Initialize OIDC client.

        Args:
            base_url: Base OIDC provider URL.
                Example: https://sso.example.com
            realm: Target realm or tenant name.
            auth_realm: Realm name for authentification.
            client_id: Service account client ID.
            client_secret: Client secret (for confidential clients using client_credentials).
            username: Username for password grant (typically "admin" in local Docker).
            password: Password for password grant (typically "admin" in local Docker).
            timeout: HTTP request timeout in seconds.
        """
        self.base_url = base_url.rstrip("/")
        self.realm = realm
        self.client_id = client_id
        self.client_secret = client_secret
        self.username = username
        self.password = password
        self.timeout = timeout
        self.auth_realm = auth_realm or realm

        self._validate_auth_config()

    @property
    def http_client(self) -> httpx.AsyncClient:
        """Lazily create and reuse a single AsyncClient instance."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=self.timeout)
        return self._http_client

    async def aclose(self) -> None:
        """Close shared HTTP client."""
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    def _validate_auth_config(self) -> None:
        """Ensure exactly one authentication method is configured."""
        has_client_secret = bool(self.client_secret)
        has_password_grant = bool(self.username and self.password)

        if has_client_secret and has_password_grant:
            raise ValueError(
                "Cannot provide both 'client_secret' and 'username/password'. Choose one authentication method."
            )

        if not has_client_secret and not has_password_grant:
            raise ValueError(
                "Either 'client_secret' (for client_credentials) "
                "or both 'username' and 'password' (for password grant) must be provided."
            )

    @property
    @abstractmethod
    def token_url(self) -> str:
        """Return token endpoint URL."""

    @abstractmethod
    async def list_users(
        self,
        *,
        first: int = 0,
        max_results: int = 100,
        search: str | None = None,
    ) -> list[OidcUserInfo]:
        """Return users from the OIDC provider."""

    async def list_all_users(self) -> list[OidcUserInfo]:
        """Fetch all users using pagination."""
        users: list[OidcUserInfo] = []
        first = 0
        page_size = 100

        while True:
            batch = await self.list_users(
                first=first,
                max_results=page_size,
            )

            if not batch:
                break

            users.extend(batch)

            if len(batch) < page_size:
                break

            first += page_size

        return users

    @abstractmethod
    async def set_user_realm_roles(
        self,
        *,
        user_id: str,
        roles: list[OidcRoles],
        changeable_roles: Sequence[OidcRoles] | None = None,
    ) -> None:
        """Replace a user's managed realm roles."""

    async def get_access_token(self) -> str:
        """Fetch an admin access token.

        Uses:
          - 'password' grant when username and password are provided (standard for local Docker).
          - 'client_credentials' grant when client_secret is provided.
        """
        if self.client_secret:
            data: dict[str, str] = {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }
        else:
            if self.username is None or self.password is None:
                raise ValueError("username/password must be configured for password grant")

            data: dict[str, str] = {
                "grant_type": "password",
                "client_id": self.client_id,
                "username": self.username,
                "password": self.password,
            }

        response = await self.http_client.post(
            self.token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if not response.is_success:
            raise RuntimeError(
                dedent(
                    f"""
                    OIDC token request failed.
                    URL: {self.token_url}
                    Status: {response.status_code} {response.reason_phrase}
                    Client ID: {self.client_id}
                    Response: {response.text[:400]}
                    """
                ).strip()
            )

        try:
            payload = response.json()
            return payload["access_token"]
        except Exception as e:
            raise RuntimeError(
                f"Failed to parse OIDC token response from {self.token_url}\nBody: {response.text[:300]}"
            ) from e


class KeycloakClient(OidcClient):
    """Async client for interacting with the Keycloak Admin API."""

    _managed_realm_roles = (OidcRoles.ADMIN, OidcRoles.USER)

    @property
    @override
    def token_url(self) -> str:
        """Return Keycloak token endpoint URL."""
        return f"{self.base_url}/realms/{self.auth_realm}/protocol/openid-connect/token"

    @property
    def users_url(self) -> str:
        """Return Keycloak users endpoint URL."""
        return f"{self.base_url}/admin/realms/{self.realm}/users"

    @property
    def roles_url(self) -> str:
        return f"{self.base_url}/admin/realms/{self.realm}/roles"

    async def _get_managed_realm_roles_by_user_id(self, headers: dict[str, str]) -> dict[str, list[str]]:
        roles_by_user_id: dict[str, list[str]] = {}

        for role_name in self._managed_realm_roles:
            response = await self.http_client.get(
                f"{self.roles_url}/{quote(role_name, safe='')}/users",
                params={"briefRepresentation": True, "max": -1},
                headers=headers,
            )

            if response.status_code == HTTPStatus.NOT_FOUND:
                continue

            response.raise_for_status()
            for user in response.json():
                if isinstance(user, dict) and isinstance(user.get("id"), str):
                    roles_by_user_id.setdefault(user["id"], []).append(role_name)

        return roles_by_user_id

    async def _get_users_payload(
        self,
        *,
        headers: dict[str, str],
        first: int,
        max_results: int,
        search: str | None = None,
    ) -> list[dict[str, object]]:
        params: dict[str, Any] = {
            "first": first,
            "max": max_results,
        }

        if search:
            params["search"] = search

        response = await self.http_client.get(
            self.users_url,
            params=params,
            headers=headers,
        )
        response.raise_for_status()
        return response.json()

    def _add_managed_realm_roles(
        self,
        users: list[dict[str, object]],
        roles_by_user_id: dict[str, list[str]],
    ) -> list[dict[str, object]]:
        return [
            {
                **user,
                "realm_access": {"roles": roles_by_user_id.get(str(user.get("id")), [])},
            }
            for user in users
        ]

    @override
    async def list_users(
        self,
        *,
        first: int = 0,
        max_results: int = 100,
        search: str | None = None,
    ) -> list[OidcUserInfo]:
        """Return users from Keycloak.

        Args:
            first: Pagination start offset.
            max_results: Max number of users to return.
            search: Optional search term.

        Returns:
            List of user objects from Keycloak.

        Raises:
            httpx.HTTPStatusError: If request fails.
        """
        token = await self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        users = await self._get_users_payload(
            headers=headers,
            first=first,
            max_results=max_results,
            search=search,
        )
        if not users:
            return []

        roles_by_user_id = await self._get_managed_realm_roles_by_user_id(headers)
        return OidcUserInfo.from_list_payload(self._add_managed_realm_roles(users, roles_by_user_id))

    @override
    async def list_all_users(self) -> list[OidcUserInfo]:
        """Fetch all users from Keycloak using pagination."""
        token = await self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        roles_by_user_id = await self._get_managed_realm_roles_by_user_id(headers)

        users: list[dict[str, object]] = []
        first = 0
        page_size = 100

        while True:
            batch = await self._get_users_payload(
                headers=headers,
                first=first,
                max_results=page_size,
            )

            if not batch:
                break

            users.extend(batch)

            if len(batch) < page_size:
                break

            first += page_size

        return OidcUserInfo.from_list_payload(self._add_managed_realm_roles(users, roles_by_user_id))

    @override
    async def set_user_realm_roles(
        self,
        *,
        user_id: str,
        roles: list[OidcRoles],
        changeable_roles: Sequence[OidcRoles] | None = None,
    ) -> None:
        """
        Replace the user's managed realm roles with the provided roles.

        If changeable_roles is provided, only those roles may be removed or
        assigned. Other existing realm roles are preserved.

        Example:
            [] -> removes all realm roles
            [ADMIN]
            [ADMIN, USER]
        """
        token = await self.get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        # Get all realm roles
        all_roles_response = await self.http_client.get(
            self.roles_url,
            headers=headers,
        )
        all_roles_response.raise_for_status()
        all_roles = all_roles_response.json()
        role_map = {role["name"]: role for role in all_roles}

        requested_role_names = set(roles)
        changeable_role_names = set(changeable_roles) if changeable_roles is not None else None
        if changeable_role_names is not None and not requested_role_names.issubset(changeable_role_names):
            raise ValueError("Requested roles must be included in changeable_roles.")

        # Get current roles mapping
        current_roles_response = await self.http_client.get(
            f"{self.users_url}/{user_id}/role-mappings/realm",
            headers=headers,
        )
        current_roles_response.raise_for_status()
        current_roles = current_roles_response.json()
        current_role_names = {role["name"] for role in current_roles}

        removable_roles = [
            role
            for role in current_roles
            if (changeable_role_names is None or role["name"] in changeable_role_names)
            and role["name"] not in requested_role_names
        ]
        if removable_roles:
            remove_response = await self.http_client.request(
                method="DELETE",
                url=f"{self.users_url}/{user_id}/role-mappings/realm",
                headers={
                    **headers,
                    "Content-Type": "application/json",
                },
                json=removable_roles,
            )
            remove_response.raise_for_status()

        # Assign requested roles
        requested_role_payloads: list[dict[str, Any]] = []
        for role in roles:
            if role in current_role_names:
                continue
            role_representation = role_map.get(role)
            if role_representation is None:
                raise ValueError(f"Realm role '{role}' does not exist in Keycloak.")
            requested_role_payloads.append(role_representation)

        if requested_role_payloads:
            add_response = await self.http_client.post(
                f"{self.users_url}/{user_id}/role-mappings/realm",
                headers={
                    **headers,
                    "Content-Type": "application/json",
                },
                json=requested_role_payloads,
            )
            add_response.raise_for_status()
