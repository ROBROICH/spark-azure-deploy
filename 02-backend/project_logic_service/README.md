# Dienst Verfahrensverwaltung (Project Logic Service)

A microservice handling core project-related domains, including deadlines, process steps, and project management.

## Core Features

- **Projects:** Provides project CRUD operations.
- **Deadlines:** Manages project deadlines.
- **Process steps:** Manages process steps for projects.
- **Generic types:** Provides project types and project statuses.

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

Non-secret configuration lives in `.env.local` (tracked in git). To generate secrets, run once from the repository root:

```bash
scripts/create_secrets.sh
```

This creates the shared root-level `.env` used by the local Docker Compose setup.

### Environment Variables

Nested settings use the `__` (double-underscore) delimiter (e.g. `TEMPORAL__HOST`, `API__ADMINISTRATIVE_FILE_DRAFT_BASE_URL`).

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PROJECT_LOGIC_SERVICE_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` | no |
| `BLOCKED_HTTP_METHODS` | HTTP methods blocked by middleware | `TRACE,PUT` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods | `GET,POST,PATCH,DELETE,OPTIONS` | no |
| `SERVICE_NAME` | Service identifier | `project-logic-service` | no |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | — | yes |
| `OTEL_ENDPOINT` | OpenTelemetry collector endpoint | — | yes |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `DB_HOST` | PostgreSQL host | — | yes |
| `DB_PORT` | PostgreSQL port | — | yes |
| `DB_NAME` | PostgreSQL database name | — | yes |
| `DATABASE_URL` | Direct connection string override (takes precedence over `DB_*`) | constructed from `DB_*` | no |
| `PROJECT_CUT_OFF_DATE` | Optional UTC cut-off date for project logic comparisons | — | no |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `API__ADMINISTRATIVE_FILE_DRAFT_BASE_URL` | Base URL for **Dienst Verwaltungsaktentwurf** *(deployment-injected)* | — | yes |
| `API__TIMEOUT` | HTTP timeout (seconds) for outbound calls to dependent services | `60` | no |
| `API__PLS_BASE_URL` | Base URL for this service when used by integrations | — | yes |
| `API__DMS_BASE_URL` | Base URL of **Dienst Dokumentenmanagementsystem** | — | yes |
| `API__FCS_BASE_URL` | Base URL of **Dienst formale Vollständigkeitsprüfung** | — | yes |
| `API__PLAUSIBILITY_BASE_URL` | Base URL of **Dienst Plausibilitätsprüfung** | — | yes |
| `API__EXAMINATION_BASE_URL` | Base URL of **Dienst rechtliche Prüfung** | — | yes |
| `API__OBJECTIONS_BASE_URL` | Base URL of **Dienst Einwendungsverwaltung** | — | yes |
| `TEMPORAL__HOST` | Temporal frontend host:port | — | yes |
| `TEMPORAL__TASK_QUEUE` | Temporal task queue used by this service | — | yes |
| `TEMPORAL__NAMESPACE` | Temporal namespace (set in the base deployment but currently missing from `.example.env`) | `default` | no |
| `TEMPORAL__S3_BUCKET_NAME` | S3 bucket used for large Temporal payloads | — | yes |
| `TEMPORAL__S3_ENDPOINT_URL` | S3 endpoint URL | — | yes |
| `TEMPORAL__S3_ACCESS_KEY_ID` | S3 access key ID | — | yes |
| `TEMPORAL__S3_SECRET_ACCESS_KEY` | S3 secret access key | — | yes |
| `TEMPORAL__S3_REGION` | S3 region | — | yes |
| `SKIP_DOTENV` | When set, disables loading of `.example.env` / `.env` files | — | no |
| `AUTH_MODE` | Auth enforcement mode *(deployment-injected)* | `strict` | no |
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

- **API docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/healthz
- **Metrics**: http://localhost:8000/metrics

### Troubleshooting

- **Port already in use:** Change the port mapping in `docker-compose.yml` or stop the conflicting service

- **Database connection issues:** Verify `DB_*` variables in `.env.local` and `.env`, and confirm PostgreSQL is running

- **Migrations not applied:** Check `docker compose logs app` and verify migration files exist in `src/models/db/migrations/versions/`

## Docker & Docker Compose

```bash
# Start shared services from repo root
docker compose -f ../../docker-compose.yaml up -d

docker compose up --build

# Subsequent runs
docker compose up -d

# View logs
docker compose logs -f app
```

## Database Migrations

```bash
# Apply migrations
uv run alembic upgrade head

# Generate a new migration
uv run alembic revision --autogenerate -m "description"
```

## Architecture

### Overview

**Dienst Verfahrensverwaltung** follows a standard microservice pattern with an independent PostgreSQL database, async SQLAlchemy, ECS-compatible structured logging, and Prometheus metrics.

### Data Models

- **Project:** Core entity with status and type references. References an optional `Applicant` via a nullable `applicant_id` foreign key

- **Applicant:** Stores applicant contact details (13 fields: name, address, contact info). All fields are nullable, allowing projects to exist without an applicant

- **Deadline / Process Step:** Scoped to a project; process steps are also filtered by project type

## API Endpoints

### Projects

| Method  | Path                            | Description           |
| ------- | ------------------------------- | --------------------- |
| `GET`   | `/projects`                     | List projects         |
| `POST`  | `/projects`                     | Create a project      |
| `GET`   | `/projects/{project_id}`        | Get project details   |
| `PATCH` | `/projects/{project_id}`        | Update a project      |
| `PATCH` | `/projects/{project_id}/status` | Update project status |
| `DELETE` | `/projects/{project_id}` | Delete a project |
| `POST` | `/projects/{project_id}/initialize` | Start project initialization |
| `GET` | `/projects/{project_id}/latest-version` | Get the latest project version |
| `POST` | `/projects/{project_id}/version-lock/validate` | Validate a project version lock |
| `POST` | `/projects/{project_id}/version-lock/validate-write` | Validate write access for a project version |

### Deadlines

| Method   | Path                       | Description                                 |
| -------- | -------------------------- | ------------------------------------------- |
| `GET`    | `/deadlines`               | List deadlines (filterable by `project_id`) |
| `POST`   | `/deadlines`               | Create a deadline                           |
| `GET`    | `/deadlines/{deadline_id}` | Get a deadline                              |
| `PATCH`  | `/deadlines/{deadline_id}` | Update a deadline                           |
| `DELETE` | `/deadlines/{deadline_id}` | Delete a deadline                           |

### Reference Data

| Method | Path                | Description           |
| ------ | ------------------- | --------------------- |
| `GET`  | `/process-steps`    | List process steps    |
| `GET`  | `/process-steps/{process_step_id}` | Get a process step |
| `GET`  | `/project-types`    | List project types    |
| `POST` | `/project-types` | Create project types |
| `PATCH` | `/project-types` | Update project types |
| `DELETE` | `/project-types` | Delete project types |
| `GET`  | `/project-statuses` | List project statuses |
| `GET` | `/topics` | List topics |
| `POST` | `/topics` | Create a topic |
| `GET` | `/topics/{topic_id}` | Get a topic |
| `PATCH` | `/topics/{topic_id}` | Update a topic |
| `DELETE` | `/topics/{topic_id}` | Delete a topic |
| `POST` | `/topics/batch` | Fetch topics in batch |
| `GET` | `/topics/{topic_id}/norms` | Get norms for a topic |
| `GET` | `/healthz`, `/ready`, `/startup` | Health and lifecycle probes |
| `GET` | `/metrics` | Prometheus metrics endpoint |

Full interactive API documentation: http://localhost:8000/docs
 
