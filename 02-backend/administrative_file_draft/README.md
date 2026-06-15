# Dienst Verwaltungsaktentwurf (Service Administrative File Draft)

**Dienst Verwaltungsaktentwurf** is a FastAPI service that manages administrative file draft structures, reusable templates, project-specific risks, and document exports for a project.

## Core Features

The service is responsible for:

- **Template management:** Manages reusable draft templates per project type.
- **Project draft assignment:** Assigns an active template to a project and persists the resulting draft node tree.
- **Risk management:** Stores and updates project-specific risks for draft nodes.
- **Document export:** Exports draft content as DOCX or PDF.
- **Operational endpoints:** Exposes health, readiness, startup, and metrics endpoints for operational use.

## Architecture

### Overview

FastAPI routers cover draft templates, project assignments, risks, and exports, while generated node CRUD routes expose the project draft tree. Persistent state lives in PostgreSQL.

### Dependencies

The service depends on:
- PostgreSQL for persistent storage
- **Dienst Verfahrensverwaltung** via `PROJECT_LOGIC_SERVICE_URL`
- an UNO-compatible conversion service for PDF export
- **Event-Logging-Library** for request and event logging
- **Node-Crud-Library** for generated CRUD routes for draft nodes
- `alembic-utils` for versioned SQLAlchemy models and migrations

### Data Models

- `VaeTemplate`: reusable template metadata for a project type, including version and activation state
- `VaeTemplateNode`: hierarchical template nodes used to define draft structures
- `VaeNode`: project-level draft nodes created from templates and exposed through generated CRUD routes
- `Risk`: project-specific risk entries linked to draft nodes

### API Endpoints

- `GET /health`, `GET /healthz`, `GET /ready`, `GET /startup`: health and lifecycle probes
- `GET /metrics`: Prometheus metrics endpoint
- `GET /risks/{project_id}`, `POST /risks/{project_id}`, `PATCH /risks/{risk_id}`: list, create, and update project risks
- `POST /{project_id}/export/docx`, `POST /{project_id}/export/pdf`: export a project draft as DOCX or PDF
- `POST /templates`, `GET /templates`, `GET /templates/{template_id}`: create and retrieve templates
- `POST /templates/{template_id}/activate`: activate a template for a project type
- `POST /templates/{template_id}/nodes`, `GET /templates/{template_id}/nodes`: manage template node trees
- `POST /templates/{project_id}/assign-template/{project_type_id}`: assign a template to a project
- `GET /{project_id}/nodes`, `POST /{project_id}/batch-nodes`, `POST /{project_id}/update`: generated CRUD endpoints for draft nodes

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- PostgreSQL
- Shared platform services as described in the root README when running locally
- Dependencies of **Modul Inhaltsextraktion**

### Installation

1. Copy `.example.env` to `.env.local`.
2. Adjust the database and UNO settings for your environment.
3. Install dependencies:

```bash
uv sync
```

### Environment Variables

Configure the service through `.env.local`.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_USER` | Database user name | — | yes |
| `DB_PASSWORD` | Database password | — | yes |
| `DB_NAME` | Database name | — | yes |
| `DB_HOST` | Database host | `localhost` | no |
| `DB_PORT` | Database port | `5432` | no |
| `UNO_HOST` | Host name of the document conversion service | `localhost` | no |
| `UNO_PORT` | Port of the document conversion service | `2003` | no |
| `UNO_PROTOCOL` | Protocol used to reach the document conversion service | `http` | no |
| `SERVICE_NAME` | Service identifier used for logging and middleware | `administrative-file-draft` | no |
| `PROJECT_LOGIC_SERVICE_URL` | Base URL of **Dienst Verfahrensverwaltung** | `http://localhost:18000` | no |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** used by generated node routes | — | yes |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `[]` | yes |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS configuration | `["GET", "POST", "PATCH", "OPTIONS"]` | no |
| `BUCKET_NAME` | Object storage bucket name *(deployment-injected)* | — | no |
| `IMPERSONATE_SERVICE_ACCOUNT` | External provider service account for impersonation *(deployment-injected)* | — | no |
| `AUTH_BASE_URL` | OIDC provider base URL *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_MODE` | Auth enforcement mode *(deployment-injected)* | `strict` | no |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB preshared key *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | SpiceDB insecure flag *(deployment-injected)* | `false` | no |

### Running the Service

Run the service locally with automatic reload:

```bash
uv run uvicorn src.main:app --reload
```

After startup, the service exposes:
- OpenAPI documentation at `/docs`
- Prometheus metrics at `/metrics`
- health and probe endpoints at `/health`, `/healthz`, `/ready`, and `/startup`

For containerized deployment, use the provided `Dockerfile` and `docker-compose.yml`. Environment-specific registry authentication steps are intentionally documented only in `DEVELOPER-README.md`.

## Troubleshooting

- If startup fails, verify that `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are set correctly.
- If `/ready` returns `503`, verify database connectivity and that migrations have been applied.
- If PDF export fails, verify that the UNO conversion service is reachable through `UNO_HOST` and `UNO_PORT`.
- Run the test suite with `uv run pytest` to catch configuration and integration regressions early.
