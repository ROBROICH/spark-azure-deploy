# Dienst Nachforderungsverwaltung (Supplementary Request Service)

FastAPI microservice for managing project-scoped supplementary requests and their inclusion in downstream communication.

## Core Features

- **Supplementary request CRUD:** Creates, lists, updates, and deletes supplementary requests for a project.
- **Project-scoped filtering:** Filters requests by source type and inclusion state.
- **Sorting and pagination:** Supports `created_at` and `updated_at` sorting with optional `limit` and `offset`.
- **Source binding:** Stores optional source references and prevents duplicate source bindings within one project.
- **Audit logging:** Records create, update, and delete operations with request audit context.
- **Authorization:** Uses project-level read, create, update, and delete permissions.
- **Operational endpoints:** Exposes startup, readiness, health, and metrics endpoints.
- **Startup migrations:** Applies database migrations during application startup.

## Architecture

### Overview

**Dienst Nachforderungsverwaltung** stores supplementary requests for projects. A supplementary request contains a title, reason, priority, optional source reference, optional topic or document reference, and a flag indicating whether it is included in a letter.

All domain routes are scoped by `project_id`. Route dependencies enforce project-level permissions through **Granulare Zugriffsautorisierung (ReBAC)** before the service reads or mutates data. Write operations also record audit entries in the same database transaction.

### Components

- **`main.py`:** Creates the FastAPI application, registers middleware, exception handlers, metrics, routers, and lifespan handling.
- **`api/routers.py`:** Aggregates service route modules.
- **`api/routes/supplementary_requests.py`:** Defines project-scoped supplementary request endpoints and authorization dependencies.
- **`api/routes/probe_router.py`:** Defines health, readiness, and startup probes.
- **`services/supplementary_requests/supplementary_request_service.py`:** Contains business logic for filtering, sorting, duplicate source checks, audit entry creation, and persistence.
- **`models/db/db_models.py`:** Defines the supplementary request database model.
- **`models/db/enums.py`:** Defines priority, legacy process step, and source type values.
- **`models/schemas/supplementary_request_schemas.py`:** Defines request and response schemas.
- **`models/db/database.py`:** Configures async database engine and sessions.
- **`config/settings.py`:** Loads middleware, database, service, and dependency settings from environment variables.

### Dependencies

| Module / Service | Purpose |
| ---------------- | ------- |
| **Relationale Datenspeicherung** | Stores supplementary requests, audit log data, and migration state. |
| **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** | Provides authentication tokens and roles for incoming requests. |
| **Granulare Zugriffsautorisierung (ReBAC)** | Evaluates project-level read, create, update, and delete permissions. |
| **Dienst Workflowmanagement** | Configured service URL for workflow integration. |
| **Event-Logging-Library** | Emits structured service, API, and database log events. |
| `audit-client` | Adds audit context middleware and records audit entries for write operations. |
| `authentification` | Provides FastAPI authentication and authorization dependencies. |
| `alembic-utils` | Supports database migration handling. |

### Data Models

- **`SupplementaryRequest`:** Project-scoped database entity with title, reason, priority, optional source type and source item ID, inclusion flag, optional topic ID, optional document ID, timestamps, and versioning metadata.
- **`SourceRef`:** API schema for an optional source reference with `type` and `itemId`.
- **`CreateSupplementaryRequestRequest`:** Request body for creating a supplementary request.
- **`UpdateSupplementaryRequestRequest`:** Partial request body for updating a supplementary request.
- **`SupplementaryRequestResponse`:** Response schema that returns the stored request and assembles flat source columns into `sourceRef`.

The database still contains a nullable legacy `process_step` column. It is intentionally not part of the public API.

### API Endpoints

Supplementary request routes are prefixed with `/projects/{project_id}/supplementary-requests`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/projects/{project_id}/supplementary-requests` | List supplementary requests for a project. Supports `source_type`, `included_in_letter`, `sort`, `limit`, and `offset`. |
| `POST` | `/projects/{project_id}/supplementary-requests` | Create a supplementary request for a project. |
| `PATCH` | `/projects/{project_id}/supplementary-requests/{request_id}` | Update a supplementary request. |
| `DELETE` | `/projects/{project_id}/supplementary-requests/{request_id}` | Delete a supplementary request. |

Operational routes:

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/healthz` | Lightweight health probe. |
| `GET` | `/ready` | Readiness probe. |
| `GET` | `/startup` | Startup probe. |
| `GET` | `/metrics` | Prometheus metrics endpoint. |

## Project Structure

```
├── alembic.ini
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
├── src/
│   ├── api/
│   │   ├── middlewares/                    # CORS, method, security, and encoding middleware
│   │   ├── routes/                         # Supplementary request and probe routes
│   │   └── routers.py                      # Router aggregation
│   ├── config/                             # Settings, constants, and exception handlers
│   ├── exceptions.py                       # Domain exception types
│   ├── lifespan.py                         # Startup migration flow
│   ├── main.py                             # FastAPI application setup
│   ├── models/
│   │   ├── db/                             # Database model, enums, sessions, and migrations
│   │   └── schemas/                        # Pydantic API schemas
│   ├── services/
│   │   └── supplementary_requests/         # Supplementary request business logic
│   └── utils/                              # App state and logging helpers
└── tests/
    └── unit/                               # Route, service, and logging tests
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- **Relationale Datenspeicherung**
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** and **Granulare Zugriffsautorisierung (ReBAC)** when authentication is enabled
- **Dienst Workflowmanagement** URL configured in the environment

### Environment Variables

| Variable | Description | Default | Required |
| -------- | ----------- | ------- | -------- |
| `SERVICE_NAME` | Service identifier used by logging middleware | `supplementary-requests-service` | no |
| `LOG_LEVEL` | Python logging level | `INFO` | no |
| `SUPPLEMENTARY_REQUESTS_SERVICE_CORS_ORIGINS` | Comma-separated list or list of allowed CORS origins | `""` | no |
| `BLOCKED_HTTP_METHODS` | HTTP methods blocked by middleware | `TRACE,PUT` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS | `GET,POST,PATCH,DELETE,OPTIONS` | no |
| `DATABASE_URL` | Direct async database connection string. If omitted, it is assembled from `DB_*` values | `""` | no |
| `DB_USER` | Database user used when `DATABASE_URL` is assembled | — | yes |
| `DB_PASSWORD` | Database password used when `DATABASE_URL` is assembled | — | yes |
| `DB_HOST` | Database host | `localhost` | no |
| `DB_PORT` | Database port | `5432` | no |
| `DB_NAME` | Database name used when `DATABASE_URL` is assembled | — | yes |
| `BACKEND_URL` | Backend base URL for integrations | `http://localhost:9000` | no |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL for **Dienst Workflowmanagement** | — | yes |
| `AUTH_MODE` | Authentication mode *(deployment-injected)* | `strict` | no |
| `AUTH_BASE_URL` | Base URL for **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | Authentication realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected token audience or client ID *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | **Granulare Zugriffsautorisierung (ReBAC)** endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | **Granulare Zugriffsautorisierung (ReBAC)** access token *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Enables an insecure local ReBAC connection *(deployment-injected)* | `false` | no |
| `SKIP_DOTENV` | When set, disables loading `.env.local` and `.env` files | — | no |

Non-secret local defaults live in `.env.local`.

### Running the Module / Service

#### In Development

1. Install dependencies from the service directory:

   ```bash
   cd 02-backend/supplementary_requests_service
   uv sync
   ```

2. Create local secrets from the repository root if they are not present yet:

   ```bash
   scripts/create_secrets.sh
   ```

3. Start required shared services from the repository root.

4. Apply database migrations from the service directory:

   ```bash
   uv run alembic upgrade head
   ```

5. Run the service:

   ```bash
   uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

6. Open the interactive API documentation at `http://localhost:8000/docs`.

#### In Production

1. Build and deploy the service image using `02-backend/supplementary_requests_service/Dockerfile`.

2. Provide the required database, authentication, ReBAC, CORS, and dependency URL environment variables.

3. Allow the startup process to apply database migrations before serving traffic.

4. Expose the service HTTP port and configure probes against `/startup`, `/ready`, and `/healthz`.

## Other

### Database Migrations

Database migrations are applied during application startup. To apply them manually from the service directory:

```bash
uv run alembic upgrade head
```

Generate a new migration:

```bash
uv run alembic revision --autogenerate -m "description"
```

### Tests

Run the non-integration test suite from the repository root:

```bash
uv run --package supplementary-requests-service pytest 02-backend/supplementary_requests_service/tests
```

## Troubleshooting

- If startup fails with a settings validation error, set `DATABASE_URL` or provide `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- If `/startup` returns `503`, the service has not finished startup migrations yet.
- If list requests fail with an invalid sort error, use `created_at:asc`, `created_at:desc`, `updated_at:asc`, or `updated_at:desc`.
- If create or update returns a duplicate source binding error, another request in the same project already uses that `sourceRef`.
- If authenticated requests fail, verify the caller role, project permission, and ReBAC settings.
