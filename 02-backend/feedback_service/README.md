# Dienst Feedbackverwaltung (Service Feedback Management)

Microservice for storing user feedback. Exposes auto-generated CRUD endpoints via the shared `node-crud` package for a single `feedback` node table.

## Core Features

- **Feedback storage:** Stores positive and negative user feedback for a project.
- **Generated node API:** Exposes generated CRUD endpoints for feedback nodes.
- **Operational probes:** Exposes health, readiness, and startup probes.

## Architecture

### Overview

**Dienst Feedbackverwaltung** stores feedback nodes in PostgreSQL and exposes project-scoped generated node endpoints through FastAPI.

### API Endpoints

The `node-crud` package generates three endpoints under `/{project_id}`:

- `GET /{project_id}/nodes`: List all feedback as lightweight records without payloads.
- `POST /{project_id}/batch-nodes`: Batch-fetch feedback with full payloads.
- `POST /{project_id}/update`: Insert, update, or delete feedback in one transaction.

Probes and metrics: `/healthz`, `/ready`, `/startup`, `/metrics`.

### Data Models

Single `feedback` table extending `NodeBase` and `VersionedMixin`:

| Column | Type | Notes |
|--------|------|-------|
| `rating` | `ENUM('POSITIVE','NEGATIVE')` | Required |
| `reason` | `String` | Free text |
| `text` | `Text` | Free text |
| `user_id` | `UUID` | Required |

Plus `NodeBase` columns: `id`, `project_id`, `is_deleted`, `frontend_parent_ids`, `update_type`, `created_at`, `updated_at`, and `VersionedMixin` version fields.

## Getting Started

### Prerequisites

- `uv` package manager
- PostgreSQL
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Service identifier used for logging and middleware | `feedback-service` | no |
| `DB_USER` | PostgreSQL user | `postgres` | no |
| `DB_PASSWORD` | PostgreSQL password | `postgres` | no |
| `DB_NAME` | PostgreSQL database name | `feedback_db` | no |
| `DB_HOST` | PostgreSQL host | `localhost` | no |
| `DB_PORT` | PostgreSQL port | `5432` | no |
| `DATABASE_URL` | Direct connection string override (bypasses the `DB_*` settings) | `None` | no |
| `PROJECT_LOGIC_SERVICE_URL` | Base URL of **Dienst Verfahrensverwaltung** used by generated node routes | — | yes |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** used by generated node routes | — | yes |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS configuration | `["GET","POST","PATCH","DELETE","OPTIONS"]` | no |
| `AUTH_BASE_URL` | OIDC provider base URL *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_MODE` | Auth enforcement mode *(deployment-injected)* | `strict` | no |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB preshared key *(deployment-injected)* | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | SpiceDB insecure flag *(deployment-injected)* | `false` | no |

### Running the Service

```bash
docker compose up --build
```
