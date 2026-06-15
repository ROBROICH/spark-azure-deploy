# Dienst Identitätsverwaltung (Identity Management Service)

FastAPI microservice for exposing authenticated user identity, managing user roles.

## Core Features

- **Current user identity:** Returns normalized identity claims from a validated bearer token.
- **User listing:** Lists active users from **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst**, with optional search.
- **Role updates:** Allows authenticated users to update their changeable realm roles through a privileged OIDC client.
- **Project assignments:** Replaces project owner and member assignments while enforcing assign permissions.
- **Startup migrations:** Applies database migrations and ReBAC schema migrations during application startup.
- **Operational endpoints:** Exposes startup, readiness, health, and metrics endpoints.

## Architecture

### Overview

**Dienst Identitätsverwaltung** acts as the identity management service for backend callers. Identity endpoints read validated token claims and query users from **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst**. Assignment endpoints use **Granulare Zugriffsautorisierung (ReBAC)** to maintain project owner and member relationships.

On startup, the service applies its relational database migrations and then applies ReBAC schema migrations. Applied ReBAC migration versions are stored in the relational database so migrations are only run once.

### Components

- **`main.py`:** Creates the FastAPI application, registers middleware, exception handlers, metrics, routers, and lifespan handling.
- **`api/routers.py`:** Aggregates identity and assignment route modules.
- **`api/routes/identity.py`:** Defines current-user, user-listing, and role-update endpoints.
- **`api/routes/assignment.py`:** Defines project assignment replacement logic.
- **`api/routes/probe_router.py`:** Defines health, readiness, and startup probes.
- **`services/auth_migration/migrator.py`:** Applies ReBAC schema migrations and records applied versions.
- **`models/db_models.py`:** Defines the database table used to track applied ReBAC migrations.
- **`models/schemas/`:** Defines request and response schemas for identity and assignment operations.
- **`config/settings.py`:** Loads middleware, database, service, and dependency settings from environment variables.

### Dependencies

| Module / Service | Purpose |
| ---------------- | ------- |
| **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** | Provides validated user claims, user listing, and realm role updates. |
| **Granulare Zugriffsautorisierung (ReBAC)** | Stores authorization relationships and evaluates permissions. |
| **Relationale Datenspeicherung** | Stores applied ReBAC migration versions. |
| **Dienst Workflowmanagement** | Configured service URL for workflow integration. |
| **Event-Logging-Library** | Emits structured service and security log events. |

### Data Models

- **ReBAC migration tracking:** Stores each applied ReBAC migration version and its application timestamp.
- **`IdentityResponse`:** Normalized user identity with user ID, email, first name, last name, and role.
- **`IdentityListResponse`:** List wrapper for normalized users.
- **`UpdateRolesRequest`:** Role update request containing one or more user roles.
- **`ProjectAssignmentsRequest`:** Complete owner/member assignment set for a project.
- **`RelationshipWriteResponse`:** Success response for assignment relationship mutations.

### API Endpoints

Identity routes:

| Method | Path        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|--------|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET`  | `/me`       | Return the identity of the authenticated caller.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GET`  | `/users`    | List active users, optionally filtered by `search`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `POST` | `/me/roles` | **TESTING ONLY: This route must be explicitly enabled by providing separate OIDC credentials with elevated permissions. Enable it only in test environments to allow role switching during testing. Do not configure the required OIDC credentials in production environments (see environment variables: `AUTH_PRIVILEGED_REALM`, `AUTH_PRIVILEGED_CLIENT_ID`, `AUTH_PRIVILEGED_CLIENT_SECRET`).** Update the authenticated user's changeable realm roles. |

Assignment routes:

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/assign/projects/{project_id}/assignments` | Replace project owner and member assignments. |

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
│   │   ├── routes/                         # Identity, assignment, and probe routes
│   │   └── routers.py                      # Router aggregation
│   ├── config/                             # Settings, constants, and exception handlers
│   ├── lifespan.py                         # Startup migration flow
│   ├── main.py                             # FastAPI application setup
│   ├── models/
│   │   ├── db/                             # Database session and Alembic migrations
│   │   ├── db_models.py                    # SQLAlchemy migration tracking model
│   │   └── schemas/                        # Pydantic API schemas
│   ├── services/
│   │   └── auth_migration/                 # ReBAC migration runner and migration files
│   └── utils/                              # App state and logging helpers
└── tests/
    ├── integration/                        # Integration tests
    └── unit/                               # Unit tests
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- **Relationale Datenspeicherung**
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst**
- **Granulare Zugriffsautorisierung (ReBAC)**
- **Dienst Workflowmanagement** URL configured in the environment

### Environment Variables

| Variable | Description | Default | Required |
| -------- | ----------- | ------- | -------- |
| `SERVICE_NAME` | Service identifier used by logging middleware | `identity-management-service` | no |
| `LOG_LEVEL` | Python logging level | `INFO` | no |
| `IDENTITY_MANAGEMENT_SERVICE_CORS_ORIGINS` | Comma-separated list or list of allowed CORS origins | `""` | no |
| `BLOCKED_HTTP_METHODS` | HTTP methods blocked by middleware | `TRACE,PUT` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS | `GET,OPTIONS` | no |
| `DB_USER` | Database user | — | yes |
| `DB_PASSWORD` | Database password | — | yes |
| `DB_HOST` | Database host | `localhost` | no |
| `DB_PORT` | Database port | `5432` | no |
| `DB_NAME` | Database name | — | yes |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL for **Dienst Workflowmanagement** | — | yes |
| `AUTH_MODE` | Authentication mode *(deployment-injected)* | `strict` | no |
| `AUTH_BASE_URL` | Base URL for **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | Authentication realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected token audience or client ID *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_CLIENT_ID` | OIDC client ID used for user listing *(deployment-injected)* | — | yes for user listing |
| `AUTH_CLIENT_SECRET` | OIDC client secret used for user listing *(deployment-injected)* | — | yes for user listing |
| `AUTH_PRIVILEGED_REALM` | Realm used by the privileged OIDC client *(deployment-injected)* | — | yes for test role switching |
| `AUTH_PRIVILEGED_CLIENT_ID` | Client ID used by the privileged OIDC client *(deployment-injected)* | — | yes for test role switching |
| `AUTH_PRIVILEGED_CLIENT_SECRET` | Client secret used by the privileged OIDC client *(deployment-injected)* | — | yes for test role switching |
| `AUTH_SPICE_DB_ENDPOINT` | **Granulare Zugriffsautorisierung (ReBAC)** endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | **Granulare Zugriffsautorisierung (ReBAC)** access token *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Enables an insecure local ReBAC connection *(deployment-injected)* | `false` | no |
| `SKIP_DOTENV` | When set, disables loading `.env.local` and `.env` files | — | no |

Non-secret local defaults live in `.env.local`.

### Running the Module / Service

#### In Development

1. Install dependencies from the service directory:

   ```bash
   cd 02-backend/identity_management_service
   uv sync
   ```

2. Create local secrets from the repository root if they are not present yet:

   ```bash
   scripts/create_secrets.sh
   ```

3. Start required shared services from the repository root.

4. Run the service:

   ```bash
   uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. Open the interactive API documentation at `http://localhost:8000/docs`.

#### In Production

1. Build and deploy the service image using `02-backend/identity_management_service/Dockerfile`.

2. Provide the required database, authentication, ReBAC, CORS, and dependency URL environment variables.

3. Allow the startup process to apply database and ReBAC migrations before serving traffic.

4. Expose the service HTTP port and configure probes against `/startup`, `/ready`, and `/healthz`.

## Other

### Database Migrations

Database migrations are applied during application startup. To apply them manually from the service directory:

```bash
uv run alembic upgrade head
```

### ReBAC Migrations

ReBAC migration files live in `src/services/auth_migration/migrations/`. The startup migrator applies unapplied migrations and stores their revision IDs in the migration tracking table.

### Tests

Run the non-integration test suite from the repository root:

```bash
uv run --package identity-management-service pytest 02-backend/identity_management_service/tests
```

## Troubleshooting

- If startup fails, verify database credentials, ReBAC connectivity, and OIDC client settings.
- If `/startup` returns `503`, the application has not finished startup migrations yet.
- If `/me` returns `401`, verify that the bearer token is valid and contains an `email` claim.
- If assignment replacement fails with `400`, ensure the submitted assignment set contains at least one project owner.
- If assignment replacement fails with ReBAC errors, verify ReBAC connectivity and the caller's project assignment permissions.
