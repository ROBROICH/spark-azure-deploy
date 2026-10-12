# Authentication library for Python

Checks who is calling a Python service and what they may do. People sign in through Keycloak, the login server, and send the token they get with each request. Services inside the cluster prove who they are with a certificate that the cluster network adds to their requests. What a user may do in a project is stored in SpiceDB, a database for permissions that works with relationships between users and objects (relationship-based access control, ReBAC).

The package has a [TypeScript half](typescript/README.md) for the backend. Both read the same `AUTH_*` settings and follow the same rules, with one difference: only this Python library has the test mode `optional_verify_dry_run`. The TypeScript library refuses it.

In SPARK today, the Python shared services and AI modules use the role checks (`require_role`), `get_current_user`, and the client-credentials token provider for their outgoing calls. The project permission checks shown below are available but not used by a Python service.

## Core Features

- It checks each login token against the signing keys that Keycloak publishes, together with the expected issuer, audience, and expiry.
- Three modes decide how strict a service is: `strict`, `optional_verify_dry_run` for measuring before enforcing, and `disabled` for local tests.
- FastAPI dependencies return the current user, require roles or project permissions, and list the objects a user may see.
- Services in the cluster can call each other without a token. An allowed service certificate makes the caller the user `service`.
- `OidcClient` lists users in Keycloak and assigns their roles.
- `ClientCredentialsTokenProvider` gets a token for outgoing calls of a service. It keeps the token, renews it 30 seconds before it expires, and retries a request once with a new token after HTTP `401`. It only accepts HTTPS token URLs unless `allow_insecure_http=True` is set, and it never logs secrets or tokens.

## Architecture

### Overview

A service sets the Keycloak and SpiceDB settings and adds the FastAPI dependencies to its routes. A request is accepted if it carries a valid token or comes from an allowed service. Role and permission checks run before the route handler.

#### Modes

`AUTH_MODE` controls what this library enforces inside the service. It is separate from the sign-in that the cluster's entry gateway performs.

| Mode | Token handling | Role and permission checks | Use |
| --- | --- | --- | --- |
| `strict` | A token is required and must pass all checks. A missing or invalid token returns `401`, unless the request comes from an allowed service. | Checks need a signed-in user. A missing role or a denied permission returns `403`. | Default. The service protects itself, also against calls inside the cluster that skip the gateway. |
| `optional_verify_dry_run` | Only for tests. The token is optional. If it fails the checks, the library logs the failure and reads the token without checking it. If it cannot even be read, the request continues without a user. | Checks run and are reported, but never block. Responses carry headers such as `X-Auth-Mode`, `X-Auth-Result`, `X-Auth-Permissions`, `X-Auth-Roles`, and `X-Auth-Resource-Filter`. | Measuring what `strict` would do before turning it on. It does not protect anything. |
| `disabled` | Tokens are ignored and there is no user. Missing Keycloak and SpiceDB settings are replaced with local placeholders. | Role, permission, and list checks are skipped. Code that checks `auth_settings().mode == AuthMode.DISABLED` may also skip writing permissions. | Local tests and isolated development. Never for routes that can be reached from outside, unless another layer checks every request. |

#### Calls between services

A service that calls another service sends no token. The service mesh, the network layer of the cluster, adds the `X-Forwarded-Client-Cert` header with the caller's identity in the SPIFFE format. The header must contain exactly one `URI=` value, and it must match `AUTH_ALLOWED_MACHINE_IDENTITIES`. That list accepts exact identities and patterns such as `spiffe://cluster.local/ns/backend-module/sa/*`. An allowed caller becomes the user `service`.

In `strict` mode, a broken, unclear, or unknown identity returns `401`. The test mode continues without a user and reports `machine_invalid`. `disabled` ignores the header.

#### How this fits with the gateway and the mesh

Two layers in the cluster act before a request reaches the service:

- The entry gateway (Envoy Gateway) signs users in for traffic from outside. It uses the Keycloak client `envoy-gateway` and passes the user's token on as `Authorization: Bearer`. The services therefore set `AUTH_AUDIENCE=envoy-gateway` and `AUTH_MODE=strict`.
- The service mesh (Istio) encrypts traffic between services and proves which service is calling (mutual TLS). This library reads that identity from the header described above.

Some service ports also accept traffic without mutual TLS, so that the gateway can reach them. On those ports, the gateway is responsible for signing in users from outside, and not every request has passed through mutual TLS. `strict` mode closes that gap at the service: it rejects every request without a valid token or an allowed service identity.

### Components

| Module | Purpose |
| --- | --- |
| `dependencies.py` | FastAPI dependencies for the current user, roles, permissions, and lists of objects |
| `verifier.py` | Checking tokens against Keycloak's signing keys, per mode |
| `machine_identity.py` | Reading the service identity from `X-Forwarded-Client-Cert` |
| `auth.py`, `auth_insecure.py` | SpiceDB client for permission checks, permission writes, object lookups, and the permission schema |
| `resolver.py` | Reading object IDs from the path, the query, or the request body |
| `oidc.py` | Keycloak client for users and roles |
| `client_credentials.py` | Tokens for outgoing service calls |
| `config.py` | Settings |
| `models.py`, `enums.py`, `exceptions.py` | User model, modes, roles, permissions, objects, and errors |
| `logger.py`, `auth_utils.py`, `utils.py` | Logging of decisions and small helpers |

The tests are in `tests/unit` and `tests/integration`. `tests/fixtures/auth_policy_vectors.json` lists the expected decision for each mode and situation.

### Dependencies

| Service or package | Used for |
| --- | --- |
| Keycloak | Signing keys, users, and roles |
| SpiceDB | Project permissions |
| Event logging (`packages/event-logging`) | Logs of sign-in and permission decisions |
| Service mesh (Istio) | The identity of calling services in `X-Forwarded-Client-Cert` |

### Data Models

- `OidcUserInfo` is the user, built from the token.
- `AuthSettings` holds the settings for Keycloak, SpiceDB, and client credentials.
- `RelationshipItem` is one permission to write or delete in SpiceDB.
- `BulkCheckItem` is one permission check in a batch.

The package has no HTTP routes of its own.

## Getting Started

### Prerequisites

- Python 3.13 and uv, set up through the [root setup guide](../../README.md#getting-started).
- Keycloak to check tokens, and SpiceDB to check permissions.

Add the package to a service through the uv workspace:

```toml
[tool.uv.sources]
authentification = { workspace = true }
```

Then add `authentification` to the service's dependencies.

### Environment Variables

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `SERVICE_NAME` | Name of the service in settings and logs | `not-set` | no |
| `AUTH_MODE` | `disabled`, `optional_verify_dry_run`, or `strict` | `strict` | no |
| `AUTH_BASE_URL` | Keycloak base URL | none | yes, unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | Keycloak realm | none | yes, unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected token audience | none | yes, unless `AUTH_MODE=disabled` |
| `AUTH_JWKS_URL` | Address of the signing keys, if not derived from the issuer | derived from the issuer | no |
| `AUTH_ALGORITHMS` | Accepted signing algorithms | `["RS256"]` | no |
| `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` | Keycloak client for user administration | none | no |
| `AUTH_PRIVILEGED_REALM`, `AUTH_PRIVILEGED_CLIENT_ID`, `AUTH_PRIVILEGED_CLIENT_SECRET` | Keycloak client with more rights | none | no |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB address | none | yes, unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB key | none | yes, unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_CERT_PATH` | Certificate for the SpiceDB connection | none | no |
| `AUTH_SPICE_DB_INSECURE` | Connect to SpiceDB without TLS, for local development | `false` | no |
| `AUTH_SPICE_DB_BULK_CHUNK_SIZE` | Permission checks per batch | `1000` | no |
| `AUTH_ALLOWED_MACHINE_IDENTITIES` | Comma-separated service identities that may call without a token, `*` as wildcard | empty | no |
| `SKIP_DOTENV` | Do not load `.env.local` and `.env` | none | no |

### Running the Module / Service

The library runs inside the Python services that use it. For the services, set the Keycloak and SpiceDB variables of the environment and add the dependencies to the routes. See [Usage](#usage).

## Testing

From this directory:

```bash
uv run pytest
```

The integration test against a real Keycloak and SpiceDB is excluded by default. To run it:

1. Choose new local values for `AUTH_TEST_OIDC_ADMIN_PASSWORD`, `AUTH_TEST_OIDC_USER_PASSWORD`, and `AUTH_TEST_SPICEDB_TOKEN` in your shell. The compose file has no defaults and reads no `.env` file.
2. Start the test services. They listen only on the local machine and keep no data. `AUTH_TEST_OIDC_PORT` and `AUTH_TEST_SPICEDB_PORT` change the ports `18080` and `15051`.

   ```bash
   docker compose -p auth-tests up -d --wait
   ```

3. Run the test from the repository root. It checks one real token and one real permission grant, denial, and lookup, and it stores no credentials, token content, or permission lists:

   ```bash
   SKIP_DOTENV=1 uv run --package authentification pytest \
     -o addopts='' -m integration \
     packages/authentification/tests/integration/test_provider_qualification.py -q
   ```

4. Remove the test services and their data, again from this directory:

   ```bash
   docker compose -p auth-tests down -v --remove-orphans
   ```

## Usage

### Require a permission on a route

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

### Read object IDs from the validated request body

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

For nested values, pass the path to the field:

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

For several checks on the same validated body, use one dependency:

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

To check values from the body and from the path, combine both dependencies:

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

Do not read object IDs for permission checks from the raw JSON body. Use a validated request model, so the check and the handler read the same value.

### List the objects a user may see

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

- If `strict` mode rejects every request, check `AUTH_BASE_URL`, `AUTH_REALM`, `AUTH_AUDIENCE`, and the issuer in the token.
- If permission checks fail unexpectedly, check `AUTH_SPICE_DB_ENDPOINT`, `AUTH_SPICE_DB_TOKEN`, and whether `AUTH_SPICE_DB_INSECURE` fits the connection.
- If changes in `.env` do not show up in tests, call `auth_settings.cache_clear()` before you read the settings again.
- If calls between services fail, check that Istio adds `X-Forwarded-Client-Cert` with `SANITIZE_SET`, that both services use mutual TLS, and that the caller's identity matches `AUTH_ALLOWED_MACHINE_IDENTITIES`.
