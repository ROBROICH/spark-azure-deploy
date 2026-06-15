# Dienst Kommentarverwaltung (Comment Service)

A FastAPI microservice for managing comments on projects. Provides CRUD operations backed by PostgreSQL.

## Core Features

- **Comment management:** Creates, reads, updates, and deletes user comments scoped to a project, with optional filtering by process step and source type.

## Architecture

### Overview

**Dienst Kommentarverwaltung** exposes project-scoped comment endpoints through FastAPI and stores comment data in PostgreSQL.

## Getting Started

### Prerequisites

- `uv` package manager
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

### Dependencies

| Service    | Purpose            |
| ---------- | ------------------ |
| PostgreSQL | Primary data store |

### Installation

```bash
uv sync
```

Non-secret configuration lives in `.env.local` (tracked in git). To generate secrets, run once from the repository root

```bash
scripts/create_secrets.sh
```

This creates the shared root-level `.env` used by the local Docker Compose setup.

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Service identifier used for logging and middleware | `comment-service` | no |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `DB_NAME` | PostgreSQL database name | — | yes |
| `DB_HOST` | PostgreSQL host | `localhost` | no |
| `DB_PORT` | PostgreSQL port | `5432` | no |
| `BACKEND_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS configuration | `["POST","GET","PATCH","OPTIONS"]` | no |
| `AUTH_BASE_URL` | OIDC provider base URL *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_MODE` | Auth enforcement mode *(deployment-injected)* | `strict` | no |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB preshared key *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | SpiceDB insecure flag *(deployment-injected)* | `false` | no |

See `.env.local` for non-secret defaults.

### Running the Service

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
```

- **API docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/healthz
- **Metrics**: http://localhost:8000/metrics

## Docker & Docker Compose

```bash
# Start shared services from repo root
docker compose -f ../../docker-compose.yaml up -d

docker compose up --build

# Subsequent runs
docker compose up -d
```

## Database Migrations

```bash
# Apply migrations
uv run alembic upgrade head

# Generate a new migration
uv run alembic revision --autogenerate -m "description"
```

## API Endpoints

| Method   | Path                                           | Description                                                               |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `GET`    | `/projects/{project_id}/comments`              | List comments for a project (filterable by `process_step`, `source_type`) |
| `POST`   | `/projects/{project_id}/comments`              | Create a comment                                                          |
| `PATCH`  | `/projects/{project_id}/comments/{comment_id}` | Update a comment                                                          |
| `DELETE` | `/projects/{project_id}/comments/{comment_id}` | Delete a comment                                                          |
| `GET`    | `/healthz`                                     | Lightweight health probe                                                  |
| `GET`    | `/ready`                                       | Readiness probe                                                           |
| `GET`    | `/startup`                                     | Startup probe                                                             |
| `GET`    | `/metrics`                                     | Prometheus metrics endpoint                                               |

Full interactive API documentation: http://localhost:8000/docs
