# Dienst Einwendungsverwaltung (Objections Management Service)

A FastAPI microservice that owns the objections (Einwendungen) domain. Handles the management of objections from authorities and the public during planning approval processes (Planfeststellungsverfahren).

## Core Features

- **Generated node API:** Provides node CRUD through `node-crud`.
- **Project-scoped objection storage:** Stores objection graph data for extraction and classification outputs.

## Architecture

### Overview

**Dienst Einwendungsverwaltung** stores project-scoped objection graph data in PostgreSQL and exposes generated node endpoints through FastAPI.

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- PostgreSQL database

### Installation

```bash
uv sync
```

### Environment Variables

Copy `.env.example` to `.env` to override defaults.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods | `GET,POST,PATCH,DELETE,OPTIONS` | no |
| `SERVICE_NAME` | Service identifier | `objections-management-service` | no |
| `DB_USER` | PostgreSQL user | `postgres` | no |
| `DB_PASSWORD` | PostgreSQL password | `postgres` | no |
| `DB_HOST` | PostgreSQL host | `localhost` | no |
| `DB_PORT` | PostgreSQL port | `5432` | no |
| `DB_NAME` | PostgreSQL database name | `objections_db` | no |
| `DATABASE_URL` | Direct connection string override (takes precedence over `DB_*`) | — | no |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `DOCUMENT_MANAGEMENT_SERVICE_URL` | URL to **Dienst Dokumentenmanagementsystem** | `http://document-management-service:8000` | no |
| `PROJECT_LOGIC_SERVICE_URL` | URL to **Dienst Verfahrensverwaltung** | `http://project-logic-service:8000` | no |
| `EXTERNAL_SERVICE_TIMEOUT_SECONDS` | HTTP timeout for outbound calls to dependent services | `30.0` | no |
| `SKIP_DOTENV` | When set, disables loading of `.env.local` / `.env` files | — | no |
| `AUTH_MODE` | Auth enforcement mode *(deployment-injected)* | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience / client ID *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Disable TLS for SpiceDB connection *(deployment-injected)* | `false` | no |

### Running the Service

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
```

The service will be available at:
- API Documentation: http://localhost:8000/docs
- Health Check: http://localhost:8000/healthz
- Prometheus Metrics: http://localhost:8000/metrics

## Docker & Docker Compose

```bash
docker compose up --build
```

## Database Migrations

```bash
# Create a new migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head
```

## Development

### Running Tests

```bash
# Run all tests
uv run pytest

# Run only unit tests (mocked services)
uv run pytest tests/unit -v

# Run only integration tests (real database)
uv run pytest tests/integration -v -m integration
```

### Code Quality

```bash
uv run pre-commit run --all-files
```

## API Endpoints

Node endpoints are project-scoped and use `/{project_id}/...`.

### Node Operations
- `POST /{project_id}/update`: Create, update, and delete objection nodes.
- `GET /{project_id}/nodes`: List lightweight objection node summaries.
- `POST /{project_id}/batch-nodes`: Fetch full objection node payloads by ID.
- `GET /{project_id}/arguments/export`: Export project arguments.
- `POST /{project_id}/arguments/import`: Import project arguments.
- `GET /{project_id}/ewms/processed-file-ids`: List processed file IDs.
- `POST /{project_id}/ewms/argument-extraction`: Insert argument extraction results.
- `PATCH /{project_id}/ewms/classification`: Update classification results.
- `PATCH /{project_id}/ewms/classification-failed`: Mark classification as failed.
- `POST /{project_id}/ewms/injection-detected`: Mark prompt injection detection.
- `GET /healthz`, `GET /ready`, `GET /startup`: health and lifecycle probes.
- `GET /metrics`: Prometheus metrics endpoint.

**Note**: Requests that omit required path/query parameters (for routes that require them) return `422 Unprocessable Entity`.
