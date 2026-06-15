# Dienst Workflowmanagement (Temporal Job Service)

A FastAPI microservice for querying and monitoring Temporal workflows, with Prometheus metrics integration.

## Core Features

- **Workflow listing:** Retrieves and filters workflows by execution status and project ID.
- **Workflow details:** Provides detailed status, results, and nested child workflow information up to two levels deep.
- **Status tracking:** Returns the latest workflow ID for each execution status type.

## Architecture

### Overview

**Dienst Workflowmanagement** queries Temporal workflow executions and exposes workflow status, details, and execution-lineage data through FastAPI endpoints.

## Getting Started

### Prerequisites

- `uv` package manager
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

When using the repository's Docker setup, the `ProjectId` search attribute is created automatically.

### Dependencies

| Service  | Purpose                  |
| -------- | ------------------------ |
| Temporal | Workflow engine to query |

### Installation

```bash
uv sync
```

Non-secret configuration lives in `.env.local` (tracked in git). Auth-related secrets are required only when authentication is enabled.

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TEMPORAL_ADDRESS` | Temporal server address (host:port) | `localhost:7233` | no |
| `TEMPORAL_NAMESPACE` | Temporal namespace to query | `default` | no |
| `SERVICE_NAME` | Service identifier | `temporal-job-service` | no |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | `temporal-job-service` | no |
| `OTEL_ENDPOINT` | OpenTelemetry collector endpoint | `http://localhost:4317` | no |
| `AUTH_MODE` | Auth enforcement mode for the shared `authentification` package | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience / client ID | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Disable TLS for SpiceDB connection | `false` | no |
| `MAX_SYSTEM_COMPLEXITY` | Maximum total complexity the system can handle. Load percentage is calculated against this value. | sum of `WORKFLOW_COMPLEXITY` values (currently `22584.5`) | no |
| `WORKFLOW_COMPLEXITY` | JSON object mapping workflow type name to complexity weight. Override the in-code defaults. | _(in-code defaults, see `src/config/settings.py`)_ | no |
| `DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT` | Weight assigned to workflow types not present in `WORKFLOW_COMPLEXITY`. | `3` | no |
| `RECONCILER_ENABLED` | Enable reconciliation of persisted workflow tracking data | `true` | no |
| `RECONCILER_INTERVAL_SECONDS` | Interval between reconciliation runs | `120` | no |
| `RECONCILER_BATCH_SIZE` | Maximum workflows reconciled per batch | `500` | no |
| `RECONCILER_BACKFILL_WINDOW_MINUTES` | Backfill window for reconciliation | `30` | no |
| `RECONCILER_PENDING_TIMEOUT_MINUTES` | Timeout before pending workflows are reconciled | `1440` | no |
| `ARCHIVAL_ENABLED` | Enable recurring workflow history archival | `true` | no |
| `ARCHIVAL_CRON` | Cron expression for archival runs | `0 0 * * 0` | no |
| `ARCHIVAL_BATCH_SIZE` | Maximum unarchived workflows fetched per archival batch | `100` | no |
| `ARCHIVAL_ACTIVITY_TIMEOUT_SECONDS` | Timeout for each archival activity | `300` | no |
| `ARCHIVAL_S3_PREFIX` | S3 key prefix for archived histories | `temporal-history` | no |
| `ARCHIVAL_WORKFLOW_ID` | Workflow ID for recurring archival runs | `WeeklyArchivalWorkflow` | no |
| `TEMPORAL__HOST` | Temporal server host for workers | — | yes |
| `TEMPORAL__TASK_QUEUE` | Temporal task queue for workers | — | yes |
| `TEMPORAL__NAMESPACE` | Temporal namespace for workers | `default` | no |
| `TEMPORAL__S3_BUCKET_NAME` | S3 bucket for Temporal large-payload codec | — | yes |
| `TEMPORAL__S3_ENDPOINT_URL` | S3 endpoint URL for Temporal payloads | — | yes |
| `TEMPORAL__S3_ACCESS_KEY_ID` | S3 access key for Temporal payloads | — | yes |
| `TEMPORAL__S3_SECRET_ACCESS_KEY` | S3 secret key for Temporal payloads | — | yes |
| `TEMPORAL__S3_REGION` | S3 region for Temporal payloads | — | yes |
| `TEMPORAL__S3_ARCHIVAL_BUCKET_NAME` | S3 bucket for archived Temporal histories | — | yes |
| `DB__USER` | PostgreSQL user for workflow tracking data | — | yes |
| `DB__PASSWORD` | PostgreSQL password for workflow tracking data | — | yes |
| `DB__HOST` | PostgreSQL host for workflow tracking data | — | yes |
| `DB__PORT` | PostgreSQL port for workflow tracking data | `5432` | no |
| `DB__NAME` | PostgreSQL database name for workflow tracking data | — | yes |

See `.example.env` for a starting template with local defaults.

### Running the Service

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
```

- **API docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/health
- **Metrics**: http://localhost:8000/metrics

## Docker & Docker Compose

```bash
# Start shared services from repo root
docker compose -f ../../docker-compose.yaml up -d

docker compose up --build
```

## API Endpoints

| Method | Path                                               | Description                                                        |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/temporal/workflows`                              | List workflows, filterable by `project_id` and `execution_status`  |
| `GET`  | `/temporal/workflows/{project_id}/by-type`         | List workflows for a project and workflow type                      |
| `GET`  | `/temporal/workflows/{workflow_id}`                | Get workflow details including status, result, and child workflows |
| `GET`  | `/temporal/workflows/{workflow_id}/execution-tree` | Get full execution lineage tree                                    |
| `GET`  | `/temporal/load`                                   | Get current workflow load metrics                                  |
| `POST` | `/internal/workflows/status`                       | Internal workflow status tracking endpoint                         |
| `GET`  | `/healthz`                                        | Lightweight health probe                                           |
| `GET`  | `/ready`                                          | Readiness probe                                                    |
| `GET`  | `/startup`                                        | Startup probe                                                      |
| `GET`  | `/metrics`                                        | Prometheus metrics endpoint                                        |

#### `GET /temporal/workflows` — query parameters

| Parameter          | Required | Description                                                                                                              |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `project_id`       | Yes      | Filter workflows by project UUID                                                                                         |
| `execution_status` | No       | One of: `Running`, `Completed`, `Failed`, `Canceled`, `Terminated`, `TimedOut`, `ContinuedAsNew`, `all` (default: `all`) |

#### Response fields

- `latest_running_workflow_id` / `latest_completed_workflow_id` / `latest_failed_workflow_id` — latest workflow ID per status (null if none)
- `retrieved_workflows` — count of returned workflows
- `workflows` — array with `workflow_id`, `project_id`, `workflow_type`, `workflow_start_time`, `workflow_close_time`, `children`

Full interactive API documentation: http://localhost:8000/docs
