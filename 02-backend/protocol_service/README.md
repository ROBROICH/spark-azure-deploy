# Dienst Protokollverwaltung (Service Protocol Management)

Read-only aggregator over the `_history` tables of other services. Exposes a unified audit trail per project without owning any data itself.

## Core Features

- **Audit trail aggregation:** Reads history tables from source services and exposes a unified project history.
- **History export:** Exports a project's full audit trail as JSON.
- **Read-only access:** Keeps one read-only database connection per source service and does not own project data.

## Architecture

### Overview

**Dienst Protokollverwaltung** connects to source service databases, reads their `_history` tables, and exposes aggregated project history through FastAPI endpoints.

## Getting Started

### Prerequisites

- `uv` package manager
- Read access to the source service databases (see Configuration below)

### Installation

```bash
uv sync
```

Copy `.example.env` to `.env` and fill in the database credentials.

### Running the Service

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
```

- **API docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/healthz

### Environment Variables

The service does not own a database. It holds one read-only connection per source service.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Service identifier | `protocol-service` | no |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `PROTOCOL_SERVICE_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | _(empty)_ | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS | `GET,OPTIONS` | no |
| `AUTH_MODE` | Auth enforcement mode for the shared `authentification` package | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience / client ID | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Disable TLS for SpiceDB connection | `false` | no |
| `DB_POOL_SIZE` | SQLAlchemy connection pool size per source DB | `5` | no |
| `DB_MAX_OVERFLOW` | Additional connections allowed beyond `DB_POOL_SIZE` | `5` | no |
| `DB_POOL_PRE_PING` | Issue a `SELECT 1` before checking out pooled connections | `true` | no |
| `DB_PASSWORD` | Optional shared password applied to source DB settings that omit their own password | — | no |

Each source service requires five variables using the prefix from the table below:

| Service key | Env prefix |
|---|---|
| project_logic | `PROJECT_LOGIC_DB_` |
| formal_completeness | `FORMAL_COMPLETENESS_DB_` |
| comment | `COMMENT_DB_` |
| supplementary | `SUPPLEMENTARY_DB_` |
| plausibility | `PLAUSIBILITY_DB_` |
| document_management | `DOCUMENT_MANAGEMENT_DB_` |
| administrative_draft | `ADMINISTRATIVE_DRAFT_DB_` |
| examination | `EXAMINATION_DB_` |
| objections_management | `OBJECTIONS_MANAGEMENT_DB_` |

Each prefix takes the suffixes `USER`, `PASSWORD`, `HOST`, `PORT` (default `5432`), `NAME`.

See `.example.env` for a full list with local defaults.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/{project_id}/history` | Paginated audit trail for a project |
| `GET` | `/projects/{project_id}/history/export` | Full audit trail as downloadable JSON |
| `GET` | `/healthz` | Lightweight health probe |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/startup` | Startup probe |
| `GET` | `/metrics` | Prometheus metrics endpoint |

Query parameters for both endpoints: `from`, `to` (ISO-8601), `source` (`user`/`agent`), `service` (service key).
