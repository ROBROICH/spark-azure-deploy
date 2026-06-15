# Dienst formale Vollständigkeitsprüfung (Service Formal Completeness Check)

A FastAPI microservice that manages the formal completeness check results from **Modul formale Vollständigkeitsprüfung** in addition to checklists, templates, and table-of-contents-level annotations.

## Core Features

The **Dienst formale Vollständigkeitsprüfung** provides:

- **Completeness checks:** Manages AI-generated completeness check results and per-project status entries.
- **Template management:** Provides and manages document checklists and templates based on project type.
- **TOC notes:** Manages table-of-contents-level annotations associated with completeness checks.

## Architecture

### Overview

FastAPI routers manage formal completeness results, required document types, TOC notes, and templates. The service stores its own state in PostgreSQL and reads upstream AI result data from **Dienst Dokumentenmanagementsystem**.

### Dependencies

| Service                     | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| PostgreSQL                                 | Primary data store                            |
| **Dienst Dokumentenmanagementsystem**      | Fetches AI job result JSON by `file_id`       |
| **Dienst Verfahrensverwaltung**            | Queries project types for template management |

### Docker & Docker Compose

```bash
# Start shared services from repo root
docker compose -f ../../docker-compose.yaml up -d

docker compose up --build

# Subsequent runs
docker compose up -d
```

### API Endpoints

#### Formal Completeness (by project)

| Method   | Path                                         | Description                         |
| -------- | -------------------------------------------- | ----------------------------------- |
| `GET`    | `/{project_id}`                              | Get completeness results            |
| `GET`    | `/{project_id}/template-document-types`      | Get template document types         |
| `GET`    | `/{project_id}/required-document-types`      | List required document types        |
| `POST`   | `/{project_id}/required-document-types/initialize` | Initialize required document types  |
| `POST`   | `/{project_id}/required-document-types`      | Add a custom document type          |
| `PATCH`  | `/{project_id}/required-document-types/{document_type_id}` | Update a document type              |
| `DELETE` | `/{project_id}/required-document-types/{document_type_id}` | Remove a document type              |
| `GET`    | `/{project_id}/document-assignments`         | Get AI/human document assignments   |
| `PATCH`  | `/{project_id}/documents/{file_id}`          | Set human assignment for a document |
| `POST`   | `/{project_id}/results`                      | Receive completed AI job results    |

#### TOC Notes (by project)

| Method  | Path                                | Description                       |
| ------- | ----------------------------------- | --------------------------------- |
| `GET`   | `/{project_id}/toc-notes`           | List TOC notes                    |
| `POST`  | `/{project_id}/toc-notes`           | Create TOC notes                  |
| `POST`  | `/{project_id}/toc-notes/results`   | Receive completed TOC job results |
| `PATCH` | `/{project_id}/toc-notes/{note_id}` | Update note status                |

#### Template Management (by project type)

| Method   | Path                                     | Description                |
| -------- | ---------------------------------------- | -------------------------- |
| `GET`    | `/{project_type_id}/template-categories` | List template categories   |
| `POST`   | `/{project_type_id}/template-categories` | Create template categories |
| `DELETE` | `/{project_type_id}/template-categories` | Delete template data       |

#### Probes

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/healthz` | Lightweight health probe |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/startup` | Startup probe |
| `GET` | `/metrics` | Prometheus metrics endpoint |

Full interactive API documentation: http://localhost:8000/docs

## Getting Started

### Prerequisites

- `uv` package manager
- Shared platform services as described in the [root README](../../README.md#dependencies) when running locally

### Installation

```bash
uv sync
```

Non-secret configuration lives in `.env.local` (tracked in git). To generate secrets, run once from the repository root:

```bash
scripts/create_secrets.sh
```

This creates the shared root-level `.env` used by the local Docker Compose setup.

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | — | yes |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods | `GET,POST,PATCH,DELETE,OPTIONS` | no |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `DB_HOST` | PostgreSQL host | — | yes |
| `DB_PORT` | PostgreSQL port | — | yes |
| `DB_NAME` | PostgreSQL database name | — | yes |
| `DATABASE_URL` | Direct connection string override (takes precedence over `DB_*`) | — | no |
| `SERVICE_NAME` | Service identifier, e.g. `formal-completeness-check` | — | yes |
| `DOCUMENT_MANAGEMENT_SERVICE_URL` | URL to **Dienst Dokumentenmanagementsystem** | — | yes |
| `PROJECT_LOGIC_SERVICE_URL` | URL to **Dienst Verfahrensverwaltung** | — | yes |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `BUCKET_NAME` | Object storage bucket name *(deployment-injected)* | — | no |
| `IMPERSONATE_SERVICE_ACCOUNT` | External provider service account for signed URLs *(deployment-injected)* | — | no |
| `AUTH_MODE` | Auth enforcement mode for the shared `authentification` package *(deployment-injected)* | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience / client ID *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Disable TLS for SpiceDB connection *(deployment-injected)* | `false` | no |

See `.env.local` for non-secret defaults.

### Running the Service

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
```

The application exposes:

- **API documentation**: http://localhost:8000/docs
- **Health endpoint**: http://localhost:8000/healthz
- **Metrics**: http://localhost:8000/metrics

## Database Migrations

```bash
# Apply migrations
uv run alembic upgrade head

# Generate a new migration
uv run alembic revision --autogenerate -m "description"
```
