# OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst (OIDC- and OAuth 2.0-Compliant Identity and Authorization Service)

Shared Python library for validating OIDC bearer tokens, checking ReBAC permissions, and integrating authentication dependencies into FastAPI services.

## Core Features

- **OIDC token verification:** Validates bearer tokens against an OIDC issuer and JWKS endpoint.
- **Authentication modes:** Supports disabled, optional verification, optional verification with dry-run fallback, and strict verification modes.
- **FastAPI dependencies:** Provides helpers for resolving the current user, requiring permissions, requiring roles, and listing accessible resources.
- **ReBAC authorization:** Uses **Granulare Zugriffsautorisierung (ReBAC)** to check permissions and manage relationships.
- **Machine service authentication:** Accepts allowlisted Istio SPIFFE identities from Envoy-managed XFCC headers for tokenless service-to-service calls.
- **OIDC user administration:** Provides a client for listing users and assigning realm roles.

## Architecture

### Overview

The `authentification` package is a shared library used by backend services that need OIDC authentication and ReBAC authorization. Services configure the library with OIDC issuer settings and ReBAC connection settings, then use its FastAPI dependencies on routes.

Incoming requests are authenticated through bearer token validation or allowlisted machine identity. Authorization checks are resolved through the ReBAC client before route handlers run.

### Components

- **`dependencies.py`:** FastAPI dependencies for user resolution, permission checks, role checks, and accessible resource listing.
- **`verifier.py`:** OIDC token verifier implementation with JWKS-based signature verification and mode-specific fallback behavior.
- **`oidc.py`:** OIDC client implementation for user and realm role operations.
- **`auth.py`:** ReBAC client for permission checks, relationship updates, resource lookup, and schema operations.
- **`resolver.py`:** Resource ID resolvers for path parameters, query parameters, and request bodies.
- **`config.py`:** Pydantic settings model and cached settings loader.
- **`machine_identity.py`:** XFCC parser for Istio SPIFFE workload identities.
- **`models.py`:** Normalized OIDC user information model.
- **`enums.py`:** Authentication modes, permissions, resources, relations, subjects, and roles.

### Dependencies

| Module / Service | Purpose |
| ---------------- | ------- |
| **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** | Provides the OIDC issuer, JWKS endpoint, users, and realm roles. |
| **Granulare Zugriffsautorisierung (ReBAC)** | Stores authorization relationships and evaluates resource permissions. |
| **Event-Logging-Library** | Emits authentication and authorization log events. |
| Istio sidecar mTLS | Provides service-to-service workload identity through `X-Forwarded-Client-Cert`. |

### Data Models

- **`OidcUserInfo`:** Normalized user model created from OIDC token claims.
- **`AuthSettings`:** Environment-backed configuration model for OIDC, ReBAC, and client credentials.
- **`RelationshipItem`:** ReBAC relationship write/delete item.
- **`BulkCheckItem`:** Permission check item used for bulk authorization requests.

### API Endpoints

This package does not expose HTTP endpoints directly. It provides FastAPI dependencies and clients that consuming services attach to their own routes.

## Project Structure

```
├── docker-compose.yml          # Local OIDC and ReBAC services
├── pyproject.toml              # Package metadata and dependencies
├── src/
│   └── authentification/
│       ├── auth.py             # ReBAC client
│       ├── config.py           # Authentication settings
│       ├── dependencies.py     # FastAPI authentication dependencies
│       ├── enums.py            # Shared auth enums
│       ├── machine_identity.py # Istio SPIFFE/XFCC parser
│       ├── models.py           # OIDC user model
│       ├── oidc.py             # OIDC client
│       ├── resolver.py         # Resource resolvers
│       └── verifier.py         # OIDC verifier
└── tests/
    ├── integration/            # Integration tests for OIDC, ReBAC, and FastAPI routes
    └── unit/                   # Unit tests for package behavior
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- OIDC provider for token verification
- **Granulare Zugriffsautorisierung (ReBAC)** for permission checks

For local development, `docker-compose.yml` starts local **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** and **Granulare Zugriffsautorisierung (ReBAC)** instances.

### Installation

This is a workspace package. Add it to a service's `pyproject.toml`:

```toml
[tool.uv.sources]
authentification = { workspace = true }
```

Then add `authentification` to the service's dependencies:

```toml
[project]
dependencies = [
    "authentification",
]
```

### Environment Variables

| Variable | Description | Default | Required |
| -------- | ----------- | ------- | -------- |
| `SERVICE_NAME` | Name of the consuming service for settings and logging context. | `not-set` | no |
| `AUTH_MODE` | Authentication mode: `disabled`, `optional_verify_dry_run`, or `strict`. | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL. | — | yes, except when `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm or tenant. | — | yes, except when `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected token audience or client ID. | — | yes, except when `AUTH_MODE=disabled` |
| `AUTH_JWKS_URL` | Explicit JWKS endpoint. If omitted, the verifier derives it from the issuer URL. | — | no |
| `AUTH_ALGORITHMS` | Allowed JWT signing algorithms. | `["RS256"]` | no |
| `AUTH_CLIENT_ID` | OIDC client ID for user administration requests. | — | no |
| `AUTH_CLIENT_SECRET` | OIDC client secret for user administration requests. | — | no |
| `AUTH_PRIVILEGED_REALM` | Optional realm used by the privileged OIDC client. | — | no |
| `AUTH_PRIVILEGED_CLIENT_ID` | Client ID for the privileged OIDC client. | — | no |
| `AUTH_PRIVILEGED_CLIENT_SECRET` | Client secret for the privileged OIDC client. | — | no |
| `AUTH_SPICE_DB_ENDPOINT` | ReBAC gRPC endpoint. | — | yes, except when `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | ReBAC access token. | — | yes, except when `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_CERT_PATH` | Optional CA bundle path for the ReBAC connection. | — | no |
| `AUTH_SPICE_DB_INSECURE` | Enables an insecure plaintext ReBAC connection for local development. | `false` | no |
| `AUTH_SPICE_DB_BULK_CHUNK_SIZE` | Number of items per bulk ReBAC permission check chunk. | `1000` | no |
| `AUTH_ALLOWED_MACHINE_IDENTITIES` | Comma-separated allowlist of SPIFFE IDs or wildcard patterns accepted for tokenless service-to-service calls. | `""` | no |
| `SKIP_DOTENV` | When set, disables loading `.env.local` and `.env` files. | — | no |

When `AUTH_MODE=disabled`, missing **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** and **Granulare Zugriffsautorisierung (ReBAC)** settings are replaced with local dummy values. Other modes require `AUTH_BASE_URL`, `AUTH_REALM`, `AUTH_AUDIENCE`, `AUTH_SPICE_DB_ENDPOINT`, and `AUTH_SPICE_DB_TOKEN`.

### Authentication Modes

`AUTH_MODE` controls what this library enforces inside the FastAPI service. It is independent from edge authentication performed by Istio, Envoy Gateway, or another ingress component.

| Mode | Bearer token handling                                                                                                                                                                                                                                                            | Role and ReBAC enforcement | Intended use |
| ---- |----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| -------------------------- | ------------ |
| `strict` | A bearer token is required and must verify against the configured issuer, audience, expiry, and signature. Missing or invalid tokens return `401`, unless an allowlisted machine identity is present.                                                                                                                               | `require_role`, `require_permissions`, and `list_accessible_resources` require an authenticated user. Missing roles or denied ReBAC checks return `403`. | Default deployment mode. Services enforce authentication and authorization themselves, including direct in-cluster calls that bypass the edge proxy. |
| `optional_verify_dry_run` | **Only for testing**: A bearer token is optional. If present, the verifier first tries strict verification. If verification fails, it logs the failure and falls back to unverified claim decoding. If the token cannot even be decoded, the request continues with `user=None`. | Checks are evaluated for visibility but do not block denied ReBAC or role decisions. Responses include dry-run headers such as `X-Auth-Mode`, `X-Auth-Result`, `X-Auth-Permissions`, `X-Auth-Roles`, and `X-Auth-Resource-Filter` when relevant. | Rollout and migration mode for measuring what strict auth would do before enforcing it. Not a security boundary. |
| `disabled` | The library ignores bearer tokens and returns `user=None`. OIDC and ReBAC settings may be omitted and are replaced with dummy local values.                                                                                                                                      | Role, permission, and resource-filter dependencies skip checks because there is no authenticated user. Code that explicitly checks `auth_settings().mode == AuthMode.DISABLED` may also skip relationship writes or auth-client usage. | Local tests, isolated development, or services protected entirely by other controls. Do not use for externally reachable production routes unless another layer fully enforces access. |

Tokenless service-to-service calls can authenticate with an Istio SPIFFE identity forwarded by the inbound sidecar in `X-Forwarded-Client-Cert`. A valid XFCC value must contain exactly one `URI=` value, and that URI must match `AUTH_ALLOWED_MACHINE_IDENTITIES`. The allowlist accepts exact SPIFFE IDs and wildcard patterns such as `spiffe://cluster.local/ns/backend-module/sa/*`. An allowed machine identity resolves to a synthetic `service` user; malformed, ambiguous, or non-allowlisted machine identity headers return `401`.

### Interaction With Istio and Envoy Gateway

Istio and Envoy operate before the request reaches the FastAPI application. The project deployment config currently uses Envoy Gateway OIDC for external browser/API traffic and Istio mTLS for in-cluster workload traffic.

For Envoy Gateway OIDC, the `SecurityPolicy` uses `clientID: envoy-gateway` and `forwardAccessToken: true`. Envoy performs the login/session flow, obtains an OIDC access token, and forwards it to backend services as `Authorization: Bearer ...`. Backend deployments then set `AUTH_AUDIENCE=envoy-gateway` and use `AUTH_MODE=strict`.

That combination means:

- External requests must authenticate at Envoy before reaching the backend.
- The backend verifies the forwarded bearer token when it is present.
- Route-level role and ReBAC checks run when the verified token resolves to a user.
- A request that reaches the service without a bearer token is rejected in `strict` mode unless an allowlisted machine identity resolves to the synthetic `service` user.

`AUTH_MODE=strict` is stronger at the application layer because the service itself rejects any request without a valid bearer token. Use it when direct callers are also expected to send user/service JWTs and the service should not rely on Envoy or mesh policy for missing-token rejection.

Istio mTLS is a separate control. The project has global `PeerAuthentication` in `STRICT` mode and namespace-specific settings for backend services. Service-to-service calls between sidecar-injected workloads can therefore be authenticated and encrypted by the mesh using workload identity instead of an application-level API key. This library consumes the sanitized XFCC SPIFFE URI from the inbound sidecar and grants the synthetic `service` role only to identities matching `AUTH_ALLOWED_MACHINE_IDENTITIES` (exact IDs or wildcard patterns).

Backend `PeerAuthentication` also marks selected HTTP ports as `PERMISSIVE` so traffic from Envoy Gateway can enter backend services even when the gateway path is not using Istio sidecar mTLS. That makes the edge layer responsible for external authentication on those paths. Sidecar-to-sidecar service traffic is intended to use Istio mTLS, but the permissive backend ports mean not every request that reaches those ports is guaranteed to have used mTLS.

### Running the Module / Service

#### In Development

1. Start the local **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** and **Granulare Zugriffsautorisierung (ReBAC)** services:

   ```bash
   cd 04-shared-services/authentification
   docker compose up
   ```

2. Configure local environment variables. See `.env.example` for a local setup:

   ```bash
   AUTH_MODE=optional_verify_dry_run
   AUTH_BASE_URL=http://localhost:8080
   AUTH_REALM=master
   AUTH_AUDIENCE=test-client
   AUTH_SPICE_DB_ENDPOINT=localhost:50051
   AUTH_SPICE_DB_TOKEN=dev-secret
   AUTH_SPICE_DB_INSECURE=true
   AUTH_ALLOWED_MACHINE_IDENTITIES=spiffe://cluster.local/ns/backend/sa/caller
   ```

3. Run the tests from the repository root:

   ```bash
   uv run --package authentification pytest 04-shared-services/authentification/tests
   ```

#### In Production

1. Add `authentification` as a workspace dependency to the consuming service.

2. Set the required **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** and **Granulare Zugriffsautorisierung (ReBAC)** environment variables for the deployment environment.

3. Use the FastAPI dependencies in route definitions to authenticate callers and enforce permissions.

## Usage

### Require Permissions on a Route

```python
from uuid import UUID

from fastapi import APIRouter, Depends

from authentification.dependencies import require_permissions
from authentification.enums import Permission, Resource
from authentification.resolver import path_param

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get(
    "/{project_id}",
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id"))
            )
        ),
    ],
)
async def get_project(project_id: UUID):
    return {"status": "ok", "project_id": project_id}
```

### Resolve Resource IDs From Validated Request Bodies

```python
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from authentification.dependencies import require_permission_from_body, require_permissions, require_permissions_from_body
from authentification.enums import Permission, Resource
from authentification.resolver import path_param

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateTopicRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    project_id: UUID = Field(alias="projectId")
    name: str


class FileModel(BaseModel):
    id: UUID
    name: str


class FileActionRequest(BaseModel):
    project_id: UUID = Field(alias="projectId")
    file: FileModel


@router.post("/topics")
async def create_topic(
    payload: CreateTopicRequest = Depends(
        require_permission_from_body(
            CreateTopicRequest,
            "project_id",
            Permission.CREATE,
            Resource.PROJECT,
            bypass_roles=["admin", "service"],
        )
    ),
):
    return {"status": "ok", "project_id": payload.project_id}
```

Pass a field path for nested values:

```python
@router.post("/files/action")
async def run_file_action(
    payload: FileActionRequest = Depends(
        require_permission_from_body(
            FileActionRequest,
            ("file", "id"),
            Permission.READ,
            "file",
        )
    ),
):
    return {"status": "ok", "file_id": payload.file.id}
```

For multiple checks against the same validated body, use one dependency:

```python
@router.post("/files/action")
async def run_project_file_action(
    payload: FileActionRequest = Depends(
        require_permissions_from_body(
            FileActionRequest,
            (Resource.PROJECT, Permission.UPDATE, "project_id"),
            ("file", Permission.READ, ("file", "id")),
        )
    ),
):
    return {"status": "ok", "file_id": payload.file.id}
```

For multiple checks, combine a validated-body dependency with path/query resolvers:

```python
@router.post("/{project_id}/topics")
async def create_project_topic(
    project_id: UUID,
    payload: CreateTopicRequest = Depends(
        require_permission_from_body(
            CreateTopicRequest,
            "project_id",
            Permission.CREATE,
            Resource.PROJECT,
        )
    ),
    _: None = Depends(
        require_permissions(
            (Resource.PROJECT, Permission.READ, path_param("project_id"))
        )
    ),
):
    return {"status": "ok", "project_id": project_id, "body_project_id": payload.project_id}
```

Do not resolve authorization resources from raw JSON bodies. Use a validated request model so authorization and handler logic read the same value.

### List Accessible Resources

```python
from fastapi import APIRouter, Depends

from authentification.dependencies import get_current_user, list_accessible_resources
from authentification.enums import Permission, Resource
from authentification.models import OidcUserInfo

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/")
async def list_projects(
    user: OidcUserInfo | None = Depends(get_current_user),
    ids: list[str] = Depends(
        list_accessible_resources(
            resource_type=Resource.PROJECT,
            permission=Permission.READ,
        )
    ),
):
    return {"status": "ok", "ids": ids, "accessed_by": user.sub if user else None}
```

## Troubleshooting

- If strict mode rejects every request, verify `AUTH_BASE_URL`, `AUTH_REALM`, `AUTH_AUDIENCE`, and the issuer URL in the token.
- If ReBAC permission checks fail unexpectedly, verify `AUTH_SPICE_DB_ENDPOINT`, `AUTH_SPICE_DB_TOKEN`, and whether `AUTH_SPICE_DB_INSECURE` matches the target connection.
- If `.env` changes do not appear in tests, clear `auth_settings.cache_clear()` before creating a new settings instance.
- If machine service authentication fails, verify Istio injects `X-Forwarded-Client-Cert` with `SANITIZE_SET`, the request is sidecar-to-sidecar mTLS, and the caller's SPIFFE ID matches a pattern in `AUTH_ALLOWED_MACHINE_IDENTITIES`.
