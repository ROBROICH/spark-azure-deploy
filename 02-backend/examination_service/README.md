# Dienst rechtliche Prüfung (Service Examination)

**Dienst rechtliche Prüfung** is a FastAPI service that exposes a graph-based legal review data model, generated node CRUD APIs, and norm deconstruction endpoints for project-specific examination data.

## Core Features

The service is responsible for:

- **Graph data access:** Exposes graph-based project data through generated node CRUD endpoints.
- **Legal review storage:** Stores and retrieves legal review structures for a given project.
- **Norm deconstruction:** Provides bulk upsert and query endpoints for norm deconstructions.
- **Operational endpoints:** Exposes health, readiness, startup, and metrics endpoints for operational monitoring.

## Architecture

### Overview

Generated node CRUD endpoints expose the legal review graph, while dedicated routes handle norm deconstruction persistence in PostgreSQL.

### Dependencies

The service depends on:
- PostgreSQL for persistent storage
- **Event-Logging-Library** for request and event logging
- **Node-Crud-Library** for generated graph node CRUD endpoints
- `alembic-utils` for schema and migration support
- Prometheus instrumentation for `/metrics`

### Data Models

- graph node models under `src/models/db/prufung_models.py` define the legal review hierarchy exposed through generated CRUD endpoints
- `NormDeconstruction` stores deconstruction text keyed by `jurabk` and `paragraph`

### API Endpoints

All generated node endpoints are scoped under `/{project_id}/`, where `project_id` is a UUID.

- `GET /{project_id}/nodes`: list all nodes in a project with lightweight references and parent links
- `POST /{project_id}/batch-nodes`: fetch full typed payloads for one or more nodes
- `POST /{project_id}/update`: apply batched inserts, updates, and deletes in a single transaction
- `POST /norm-deconstructions/`: bulk upsert norm deconstruction entries by `(jurabk, paragraph)`
- `GET /norm-deconstructions/`: list norm deconstructions, optionally filtered by `jurabk` and `paragraph`
- `GET /healthz`: lightweight health probe
- `GET /ready`: readiness probe
- `GET /startup`: startup probe
- `GET /metrics`: Prometheus metrics endpoint

The OpenAPI schema documents the full set of generated node types and payload shapes. The main node hierarchy is:

```text
gesetz -> norm -> absatz -> satz -> atomares_tbm -> fundstelle
											  -> bewertung_tbm
											  -> technische_norm
dokument -> chunk
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- PostgreSQL
- Docker and Docker Compose if you want to run the local container setup

### Installation

1. Create a local environment file based on the service configuration.
2. Set database credentials in `.env.local` or `.env`.
3. Install dependencies:

```bash
uv sync
```

### Environment Variables

Configure the service with environment variables.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Service name used for logging and middleware configuration | `examination-service` | no |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `DB_NAME` | PostgreSQL database name | — | yes |
| `DB_HOST` | PostgreSQL host | `localhost` | no |
| `DB_PORT` | PostgreSQL port | `5432` | no |
| `BACKEND_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS configuration | `["GET","POST","PATCH","DELETE","OPTIONS"]` | no |
| `PROJECT_LOGIC_SERVICE_URL` | Base URL of **Dienst Verfahrensverwaltung** used by generated node routes | — | yes |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** used by generated node routes | — | yes |
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
uv run uvicorn src.main:app --host 0.0.0.0 --port 8008 --reload
```

To run the local container setup:

```bash
docker compose up --build
```

After startup, the service exposes:
- OpenAPI documentation at `/docs`
- Prometheus metrics at `/metrics`
- health and lifecycle probes at `/healthz`, `/ready`, and `/startup`

## Troubleshooting

- If the application fails on startup, verify that `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are set.
- If the containerized setup cannot connect to the database, verify the `db` service is healthy in `docker-compose.yml`.
- If generated node endpoints return validation errors, check the typed request schema in the OpenAPI document.
