import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from authentification.config import AuthSettings
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    get_verifier,
    list_accessible_resources,
    require_permission_from_body,
    require_permissions,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource, Subject
from authentification.exceptions import InvalidTokenError
from authentification.models import OidcUserInfo
from authentification.resolver import path_param, query_param
from authentification.verifier import KeycloakVerifier
from fastapi import Depends, FastAPI, Query, status
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field

POLICY_VECTORS = json.loads((Path(__file__).parents[1] / "fixtures" / "auth_policy_vectors.json").read_text())
SUBJECT_ID = "00000000-0000-0000-0000-000000000042"
PROJECT_ID = "00000000-0000-0000-0000-000000000101"
QUERY_PROJECT_ID = "00000000-0000-0000-0000-000000000102"
BODY_PROJECT_ID = "00000000-0000-0000-0000-000000000103"
WORKFLOW_ID = "00000000-0000-0000-0000-000000000104"
MACHINE_SPIFFE = "spiffe://cluster.local/ns/auth-test/sa/caller"
AUTHORIZATION = {"Authorization": "Bearer opaque-test-credential"}


class ProjectBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: UUID = Field(alias="projectId")


class WorkflowReference(BaseModel):
    id: UUID


class WorkflowBody(BaseModel):
    workflow: WorkflowReference


class StubVerifier(KeycloakVerifier):
    def __init__(self, mode: AuthMode, roles: list[str], *, valid_credential: bool) -> None:
        super().__init__(
            base_url="https://identity.invalid",
            realm="oidc-test",
            audience="oidc-test-client",
            auth_mode=mode,
        )
        self.roles = roles
        self.valid_credential = valid_credential
        self.verified_credentials: list[str] = []

    def _decode_verified(self, token: str) -> dict[str, Any]:
        self.verified_credentials.append(token)
        if not self.valid_credential:
            raise InvalidTokenError("test credential rejected")
        return {
            "sub": SUBJECT_ID,
            "realm_access": {"roles": self.roles},
        }


class StubAuthClient:
    def __init__(self, *, permission_allowed: bool, accessible_ids: list[str]) -> None:
        self.permission_allowed = permission_allowed
        self.accessible_ids = accessible_ids
        self.permission_calls: list[dict[str, object]] = []
        self.list_calls: list[dict[str, object]] = []

    async def check_permission(self, **decision: object) -> bool:
        self.permission_calls.append(decision)
        return self.permission_allowed

    async def list_resources_with_permission(self, **decision: object) -> list[str]:
        self.list_calls.append(decision)
        return self.accessible_ids


@dataclass(frozen=True)
class PolicyTestApp:
    client: TestClient
    verifier: StubVerifier
    auth_client: StubAuthClient


def _policy_app(verifier: StubVerifier, auth_client: StubAuthClient) -> FastAPI:
    app = FastAPI(title="Authentication policy tests")

    @app.get("/identity")
    async def identity(user: OidcUserInfo | None = Depends(get_current_user)) -> dict[str, str | None]:
        return {"subject": user.sub if user else None}

    @app.get("/role")
    async def role(
        user: OidcUserInfo | None = Depends(require_role(OidcRoles.ADMIN)),
    ) -> dict[str, str | None]:
        return {"role": user.role if user else None}

    @app.get("/projects/{project_id}")
    async def path_resource(
        project_id: UUID,
        _: OidcUserInfo | None = Depends(
            require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))
        ),
    ) -> dict[str, str]:
        return {"projectId": str(project_id)}

    @app.get("/projects-by-query")
    async def query_resource(
        project_id: UUID = Query(alias="projectId"),
        _: OidcUserInfo | None = Depends(
            require_permissions((Resource.PROJECT, Permission.READ, query_param("project_id")))
        ),
    ) -> dict[str, str]:
        return {"projectId": str(project_id)}

    @app.post("/project-body")
    async def body_resource(
        body: ProjectBody = Depends(
            require_permission_from_body(ProjectBody, "project_id", Permission.UPDATE, Resource.PROJECT)
        ),
    ) -> dict[str, str]:
        return {"projectId": str(body.project_id)}

    @app.post("/workflow-body")
    async def nested_body_resource(
        body: WorkflowBody = Depends(
            require_permission_from_body(
                WorkflowBody,
                ("workflow", "id"),
                Permission.EXECUTE,
                Resource.WORKFLOW,
            )
        ),
    ) -> dict[str, str]:
        return {"workflowId": str(body.workflow.id)}

    @app.get("/accessible-projects")
    async def accessible_resources(
        ids: list[str] | None = Depends(list_accessible_resources(Resource.PROJECT, Permission.READ)),
    ) -> dict[str, list[str] | None]:
        return {"ids": ids}

    @app.get("/admin-bypass/{project_id}")
    async def role_bypass(
        project_id: UUID,
        _: OidcUserInfo | None = Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN],
            )
        ),
    ) -> dict[str, str]:
        return {"projectId": str(project_id)}

    @app.get("/machine")
    async def machine(
        user: OidcUserInfo | None = Depends(require_role(OidcRoles.SERVICE)),
    ) -> dict[str, str | None]:
        return {
            "subject": user.sub if user else None,
            "role": user.role if user else None,
        }

    app.dependency_overrides[get_verifier] = lambda: verifier
    app.dependency_overrides[get_auth_client] = lambda: auth_client
    return app


@pytest.fixture
def policy_app(monkeypatch: pytest.MonkeyPatch) -> Callable[..., PolicyTestApp]:
    def build(
        mode: AuthMode,
        *,
        roles: list[str] | None = None,
        valid_credential: bool = True,
        permission_allowed: bool = True,
        accessible_ids: list[str] | None = None,
        allowed_machine_identities: str = MACHINE_SPIFFE,
    ) -> PolicyTestApp:
        settings = AuthSettings(
            mode=mode,
            base_url="https://identity.invalid",
            realm="oidc-test",
            audience="oidc-test-client",
            spice_db_endpoint="127.0.0.1:1",
            spice_db_token="unused-test-token",
            spice_db_insecure=True,
            allowed_machine_identities=allowed_machine_identities,
        )
        monkeypatch.setattr("authentification.dependencies.auth_settings", lambda: settings)
        verifier = StubVerifier(mode, roles or [OidcRoles.USER], valid_credential=valid_credential)
        auth_client = StubAuthClient(
            permission_allowed=permission_allowed,
            accessible_ids=accessible_ids or [],
        )
        return PolicyTestApp(
            client=TestClient(_policy_app(verifier, auth_client)),
            verifier=verifier,
            auth_client=auth_client,
        )

    return build


def test_disabled_mode_ignores_xfcc_and_all_providers(policy_app: Callable[..., PolicyTestApp]) -> None:
    harness = policy_app(AuthMode.DISABLED)

    response = harness.client.get("/identity", headers={"X-Forwarded-Client-Cert": "not-a-certificate"})

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"subject": None}
    assert harness.verifier.verified_credentials == []
    assert harness.auth_client.permission_calls == []


@pytest.mark.parametrize("credential_state", ["missing", "invalid"])
def test_strict_mode_uses_canonical_unauthenticated_response(
    policy_app: Callable[..., PolicyTestApp], credential_state: str
) -> None:
    harness = policy_app(AuthMode.STRICT, valid_credential=credential_state != "invalid")
    headers = AUTHORIZATION if credential_state == "invalid" else {}

    response = harness.client.get("/identity", headers=headers)
    expected = POLICY_VECTORS["http_decisions"]["unauthenticated"]

    assert response.status_code == expected["status"]
    assert response.json() == {"detail": expected["detail"]}
    assert response.headers["WWW-Authenticate"] == expected["challenge"]


def test_strict_mode_uses_canonical_role_denial(policy_app: Callable[..., PolicyTestApp]) -> None:
    harness = policy_app(AuthMode.STRICT, roles=[OidcRoles.USER])

    response = harness.client.get("/role", headers=AUTHORIZATION)
    expected = POLICY_VECTORS["http_decisions"]["forbidden"]

    assert response.status_code == expected["status"]
    assert response.json() == {"detail": expected["detail"]}


@pytest.mark.parametrize(
    ("method", "url", "body", "resource_type", "permission", "resource_id"),
    [
        ("GET", f"/projects/{PROJECT_ID}", None, Resource.PROJECT, Permission.READ, PROJECT_ID),
        (
            "GET",
            f"/projects-by-query?projectId={QUERY_PROJECT_ID}",
            None,
            Resource.PROJECT,
            Permission.READ,
            QUERY_PROJECT_ID,
        ),
        (
            "POST",
            "/project-body",
            {"projectId": BODY_PROJECT_ID},
            Resource.PROJECT,
            Permission.UPDATE,
            BODY_PROJECT_ID,
        ),
        (
            "POST",
            "/workflow-body",
            {"workflow": {"id": WORKFLOW_ID}},
            Resource.WORKFLOW,
            Permission.EXECUTE,
            WORKFLOW_ID,
        ),
    ],
)
def test_strict_routes_resolve_typed_resources_from_each_declaration_shape(
    policy_app: Callable[..., PolicyTestApp],
    method: str,
    url: str,
    body: dict[str, object] | None,
    resource_type: Resource,
    permission: Permission,
    resource_id: str,
) -> None:
    harness = policy_app(AuthMode.STRICT)

    response = harness.client.request(method, url, headers=AUTHORIZATION, json=body)

    assert response.status_code == status.HTTP_200_OK
    assert harness.auth_client.permission_calls == [
        {
            "resource_type": resource_type,
            "resource_id": resource_id,
            "permission": permission,
            "subject_type": Subject.USER,
            "subject_id": SUBJECT_ID,
        }
    ]


def test_strict_permission_denial_is_canonical(policy_app: Callable[..., PolicyTestApp]) -> None:
    harness = policy_app(AuthMode.STRICT, permission_allowed=False)

    response = harness.client.get(f"/projects/{PROJECT_ID}", headers=AUTHORIZATION)
    expected = POLICY_VECTORS["http_decisions"]["forbidden"]

    assert response.status_code == expected["status"]
    assert response.json() == {"detail": expected["detail"]}


def test_strict_accessible_filter_returns_only_provider_ids(policy_app: Callable[..., PolicyTestApp]) -> None:
    accessible_ids = [PROJECT_ID, QUERY_PROJECT_ID]
    harness = policy_app(AuthMode.STRICT, accessible_ids=accessible_ids)

    response = harness.client.get("/accessible-projects", headers=AUTHORIZATION)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"ids": accessible_ids}
    assert harness.auth_client.list_calls == [
        {
            "resource_type": Resource.PROJECT,
            "permission": Permission.READ,
            "subject_type": Subject.USER,
            "subject_id": SUBJECT_ID,
        }
    ]


def test_dry_run_reports_role_permission_filter_and_bypass_decisions(
    policy_app: Callable[..., PolicyTestApp],
) -> None:
    diagnostics = POLICY_VECTORS["dry_run_diagnostics"]

    anonymous = policy_app(AuthMode.OPTIONAL_VERIFY_DRY_RUN)
    anonymous_response = anonymous.client.get("/identity")
    assert anonymous_response.headers["X-Auth-Result"] == diagnostics["missing"]

    allowed = policy_app(AuthMode.OPTIONAL_VERIFY_DRY_RUN, roles=[OidcRoles.ADMIN])
    allowed_role_response = allowed.client.get("/role", headers=AUTHORIZATION)
    assert allowed_role_response.headers["X-Auth-Result"] == diagnostics["verified"]
    assert allowed_role_response.headers["X-Auth-Roles"] == diagnostics["role_allowed"]
    allowed_permission_response = allowed.client.get(f"/projects/{PROJECT_ID}", headers=AUTHORIZATION)
    assert allowed_permission_response.headers["X-Auth-Permissions"] == diagnostics["permission_allowed"]

    denied_role = policy_app(AuthMode.OPTIONAL_VERIFY_DRY_RUN, roles=[OidcRoles.USER])
    role_response = denied_role.client.get("/role", headers=AUTHORIZATION)
    assert role_response.status_code == status.HTTP_200_OK
    assert role_response.headers["X-Auth-Roles"] == diagnostics["role_denied"]

    denied_permission = policy_app(AuthMode.OPTIONAL_VERIFY_DRY_RUN, permission_allowed=False)
    permission_response = denied_permission.client.get(f"/projects/{PROJECT_ID}", headers=AUTHORIZATION)
    assert permission_response.status_code == status.HTTP_200_OK
    assert permission_response.headers["X-Auth-Permissions"] == diagnostics["permission_denied"]

    filtered = policy_app(
        AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        accessible_ids=[PROJECT_ID, QUERY_PROJECT_ID],
    )
    filter_response = filtered.client.get("/accessible-projects", headers=AUTHORIZATION)
    assert filter_response.status_code == status.HTTP_200_OK
    assert filter_response.json() == {"ids": None}
    assert filter_response.headers["X-Auth-Resource-Filter"] == diagnostics["resource_filter"]

    bypassed = policy_app(AuthMode.OPTIONAL_VERIFY_DRY_RUN, roles=[OidcRoles.ADMIN])
    bypass_response = bypassed.client.get(f"/admin-bypass/{PROJECT_ID}", headers=AUTHORIZATION)
    assert bypass_response.status_code == status.HTTP_200_OK
    assert bypass_response.headers["X-Auth-Permissions"] == diagnostics["permission_bypass"]
    assert bypassed.auth_client.permission_calls == []


def test_strict_mode_accepts_an_explicitly_allowed_machine(policy_app: Callable[..., PolicyTestApp]) -> None:
    harness = policy_app(AuthMode.STRICT)

    response = harness.client.get(
        "/machine",
        headers={"X-Forwarded-Client-Cert": f"Hash=fixture;URI={MACHINE_SPIFFE}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["role"] == OidcRoles.SERVICE
    assert harness.verifier.verified_credentials == []


@pytest.mark.parametrize(
    ("xfcc", "expected_result", "expected_role"),
    [
        (f"Hash=fixture;URI={MACHINE_SPIFFE}", "machine_verified", OidcRoles.SERVICE),
        ("not-a-certificate", "machine_invalid", None),
    ],
)
def test_dry_run_machine_decisions_never_block_and_are_diagnostic(
    policy_app: Callable[..., PolicyTestApp],
    xfcc: str,
    expected_result: str,
    expected_role: str | None,
) -> None:
    harness = policy_app(AuthMode.OPTIONAL_VERIFY_DRY_RUN)

    response = harness.client.get("/machine", headers={"X-Forwarded-Client-Cert": xfcc})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["role"] == expected_role
    assert response.headers["X-Auth-Mode"] == POLICY_VECTORS["dry_run_diagnostics"]["mode"]
    assert response.headers["X-Auth-Result"] == expected_result


def test_bearer_credentials_take_precedence_over_malformed_xfcc(policy_app: Callable[..., PolicyTestApp]) -> None:
    harness = policy_app(AuthMode.STRICT)

    response = harness.client.get(
        "/identity",
        headers={**AUTHORIZATION, "X-Forwarded-Client-Cert": "not-a-certificate"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"subject": SUBJECT_ID}
    assert harness.verifier.verified_credentials == ["opaque-test-credential"]
