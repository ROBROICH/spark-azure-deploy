# Dienst Plausibilitätsprüfung (Service Plausibility Check)

FastAPI microservice for storing, retrieving, updating, and deleting plausibility notes produced by **Modul Plausibilitätsprüfung**.

## Core Features

- **Result ingestion:** Receives a completed plausibility-check job notification, downloads the result JSON, and stores the contained contradictions.
- **Plausibility note retrieval:** Returns all plausibility notes for the latest project version.
- **Status management:** Updates plausibility note statuses to `OPEN`, `RESOLVED`, or `IGNORED`.
- **Note deletion:** Deletes individual plausibility notes from the current project version.
- **Project version handling:** Reads the latest project version and validates write access before modifying versioned data.
- **Authorization:** Uses role checks and project permissions before serving or changing notes.
- **Operational endpoints:** Exposes health, readiness, startup, and metrics endpoints.

## Architecture

### Overview

**Dienst Plausibilitätsprüfung** persists plausibility-check results for projects. When **Modul Plausibilitätsprüfung** finishes a job, the service receives a `job-done` request containing a result file ID. The service verifies that the file belongs to the requested project, downloads the JSON result from **Dienst Dokumentenmanagementsystem**, removes existing notes for the same project version, and stores the new plausibility notes and their occurrences.

Read and write operations are version-aware. The service asks **Dienst Verfahrensverwaltung** for the latest project version and validates write operations against the project version lock before changing data.

### Components

- **`main.py`:** Creates the FastAPI application, registers routers, exception handlers, metrics, middleware, and generated node routes.
- **`api/routes/plausibility_notes_api.py`:** Defines the public plausibility note endpoints and authorization dependencies.
- **`api/routes/probe_router.py`:** Defines health, readiness, and startup probes.
- **`services/plausibility_notes_service.py`:** Contains business logic for fetching result files, validating project bindings, storing notes, updating statuses, and deleting notes.
- **`models/db_models.py`:** Defines SQLAlchemy models for plausibility notes and note occurrences.
- **`models/schemas/plausibility_notes.py`:** Defines request and response schemas.
- **`models/db/database.py`:** Configures the async database engine and sessions.
- **`config/settings.py`:** Loads service, database, CORS, and dependency URLs from environment variables.

### Dependencies

| Module / Service | Purpose |
| ---------------- | ------- |
| **Modul Plausibilitätsprüfung** | Produces the plausibility-check result JSON consumed by this service. |
| **Dienst Dokumentenmanagementsystem** | Provides result file metadata and generated download URLs. |
| **Dienst Verfahrensverwaltung** | Provides latest project version lookup and version-lock validation. |
| **Dienst Workflowmanagement** | Configured service URL for workflow integration. |
| **Relationale Datenspeicherung** | Stores plausibility notes, occurrences, versioning data, and audit logs. |
| **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** | Provides authentication tokens and roles for incoming requests. |
| **Granulare Zugriffsautorisierung (ReBAC)** | Evaluates project-level read, update, and delete permissions. |
| **Event-Logging-Library** | Emits structured service, API, and database log events. |
| **Node-Crud-Library** | Generates version-aware node routes for the database models. |
| `audit-client` | Adds audit context and audit actor handling to API routes. |
| `authentification` | Provides FastAPI authentication and authorization dependencies. |

### Data Models

- **`PlausibilityNote`:** Stores one contradiction for a project and project version. Fields include title, description, rating, status, and versioning metadata from the node base.
- **`PlausibilityNoteOccurrence`:** Stores where a plausibility note occurs in a document. Fields include document ID, document name, content excerpt, page number, project ID, and project version.
- **`PlausibilityCheckResult`:** API schema containing a list of contradictions.
- **`Contradiction`:** API schema for one plausibility note, including status and occurrences.
- **`ContradictionOccurrence`:** API schema for document-level occurrence details.
- **`JobDoneRequest`:** Request body for completed job ingestion with `fileId`.
- **`JobDoneResponse`:** Ingestion response with status, contradiction count, occurrence count, and deleted-record count.
- **`UpdateNoteRequest`:** Request body for changing a note status.

### API Endpoints

Plausibility note routes are prefixed with `/plausibility-notes`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/plausibility-notes/{project_id}` | List all plausibility notes for the latest project version. |
| `POST` | `/plausibility-notes/{project_id}/job-done` | Process completed plausibility-check job results from a result file. |
| `PATCH` | `/plausibility-notes/notes/{note_id}` | Update a plausibility note status. |
| `DELETE` | `/plausibility-notes/notes/{note_id}` | Delete a plausibility note. |

Operational routes:

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Basic health endpoint. |
| `GET` | `/healthz` | Health probe endpoint. |
| `GET` | `/ready` | Readiness probe that checks startup state and database connectivity. |
| `GET` | `/startup` | Startup probe. |
| `GET` | `/metrics` | Prometheus metrics endpoint. |

Additional version-aware node routes are generated from the database models by **Node-Crud-Library**.

## Project Structure

```
├── alembic.ini
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
├── src/
│   ├── api/
│   │   ├── middlewares/                # CORS and security headers
│   │   └── routes/                     # Plausibility note and probe routes
│   ├── config/
│   │   └── settings.py                 # Environment-backed settings
│   ├── exceptions/                     # Service exception handlers and types
│   ├── main.py                         # FastAPI application setup
│   ├── models/
│   │   ├── db/                         # Database session and Alembic migrations
│   │   ├── db_models.py                # SQLAlchemy models
│   │   └── schemas/                    # Pydantic API schemas
│   ├── services/
│   │   └── plausibility_notes_service.py
│   └── utils/                          # App state, lifespan, and logging helpers
└── tests/
    ├── integration/                    # API integration tests
    └── unit/                           # Route and service unit tests
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- **Relationale Datenspeicherung**
- **Dienst Dokumentenmanagementsystem**
- **Dienst Verfahrensverwaltung**
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** and **Granulare Zugriffsautorisierung (ReBAC)** when authentication is enabled

### Environment Variables

| Variable | Description | Default | Required |
| -------- | ----------- | ------- | -------- |
| `SERVICE_NAME` | Service identifier used for logging and middleware | — | yes |
| `CORS_ORIGINS` | Comma-separated list or list of allowed CORS origins | — | yes |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS | `GET,POST,PATCH,DELETE,OPTIONS` | no |
| `DB_USER` | Database user | — | yes |
| `DB_PASSWORD` | Database password | — | yes |
| `DB_HOST` | Database host | — | yes |
| `DB_PORT` | Database port | — | yes |
| `DB_NAME` | Database name | — | yes |
| `DATABASE_URL` | Direct database connection string override | — | no |
| `DOCUMENT_MANAGEMENT_SERVICE_URL` | Base URL for **Dienst Dokumentenmanagementsystem** | — | yes |
| `PROJECT_LOGIC_SERVICE_URL` | Base URL for **Dienst Verfahrensverwaltung** | — | yes |
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
   cd 02-backend/plausibility_notes
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
   uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
   ```

6. Open the interactive API documentation at `http://localhost:8000/docs`.

#### In Production

1. Build and deploy the service image using `02-backend/plausibility_notes/Dockerfile`.

2. Provide the required database, dependency URL, CORS, and authentication environment variables.

3. Run Alembic migrations before serving traffic.

4. Expose the service HTTP port and configure probes against `/startup`, `/ready`, and `/healthz`.

## Other

### Database Migrations

Apply migrations:

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
uv run --package plausibility-notes pytest 02-backend/plausibility_notes/tests
```

## Troubleshooting

- If the service fails during startup, verify all required settings in `.env.local`, `.env`, or the process environment.
- If `/ready` returns `503`, check that startup completed and the database is reachable.
- If `POST /plausibility-notes/{project_id}/job-done` returns a file or project error, verify that the result file belongs to the requested project and project version.
- If update or delete requests fail, verify that the project version is not locked and that the caller has the required role and project permission.
