# Dienst Agentenorchestrierung (Agent Orchestration Service)

A FastAPI microservice that triggers and manages AI-powered workflows via [Temporal](https://temporal.io).

## Core Features

- **Workflow triggering:** Starts and cancels AI processing workflows for document analysis.
- **Activity routing:** Delegates processing steps to downstream services via Temporal activities.

## Architecture

### Overview

**Dienst Agentenorchestrierung** prepares AI job payloads, starts the corresponding Temporal workflows, and routes activities to downstream services.

## Getting Started

### Prerequisites

- `uv` package manager
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

### Dependencies

| Service                                      | Purpose                                 |
| -------------------------------------------- | --------------------------------------- |
| Temporal                                     | Durable workflow engine                 |
| S3-compatible object storage                 | Temporal large-payload codec storage    |
| **Dienst Dokumentenmanagementsystem**         | Document access for workflow activities |
| **Dienst formale Vollständigkeitsprüfung**    | Job result callback target              |
| **Dienst Plausibilitätsprüfung**              | Job result callback target              |

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

Settings use a nested delimiter (`__`) — fields under `TemporalSettings`, `APISettings`, `DIPLANSettings`, and `FPPSettings` are read as `TEMPORAL__*`, `API__*`, `DIPLAN__*`, and `FPP__*`.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Service identifier | `agent_orchestration` | no |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | — | yes |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS configuration | `["GET","POST","PATCH","OPTIONS"]` | no |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | — | yes |
| `OTEL_ENDPOINT` | OpenTelemetry collector gRPC endpoint | — | yes |
| `USE_TRANSFER_ENCODING_CHUNKED` | Enable chunked uploads for Ceph-backed flows | — | yes |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `TEMPORAL__HOST` | Temporal server address, e.g. `localhost:7233` | — | yes |
| `TEMPORAL__TASK_QUEUE` | Temporal task queue name | — | yes |
| `TEMPORAL__NAMESPACE` | Temporal namespace | `default` | no |
| `TEMPORAL__S3_BUCKET_NAME` | S3 bucket for Temporal large-payload codec | — | yes |
| `TEMPORAL__S3_ENDPOINT_URL` | S3 endpoint for Temporal payloads | — | yes |
| `TEMPORAL__S3_ACCESS_KEY_ID` | S3 access key for Temporal payloads | — | yes |
| `TEMPORAL__S3_SECRET_ACCESS_KEY` | S3 secret key for Temporal payloads | — | yes |
| `TEMPORAL__S3_REGION` | S3 region for Temporal payloads | — | yes |
| `API__TIMEOUT` | HTTP timeout for outbound service calls in seconds | `600` | no |
| `API__DIPLAN_BASE_URL` | Base URL of **Dienst DiPlan-Integration** | — | yes |
| `API__FPP_BASE_URL` | Base URL of the Formal Project Pre-check service | — | yes |
| `API__FVP_BASE_URL` | Base URL of **Dienst formale Vollständigkeitsprüfung** | — | yes |
| `API__DMS_BASE_URL` | Base URL of **Dienst Dokumentenmanagementsystem** | — | yes |
| `API__PLS_BASE_URL` | Base URL of **Dienst Verfahrensverwaltung** | — | yes |
| `API__ADMINISTRATIVE_FILE_DRAFT_BASE_URL` | Base URL of **Dienst Verwaltungsaktentwurf** | — | yes |
| `API__PLAUSIBILITY_NOTES_BASE_URL` | Base URL of **Dienst Plausibilitätsprüfung** | — | yes |
| `API__EXAMINATION_SERVICE_BASE_URL` | Base URL of **Dienst rechtliche Prüfung** | — | yes |
| `API__OBJECTIONS_SERVICE_BASE_URL` | Base URL of **Dienst Einwendungsverwaltung** | — | yes |
| `DIPLAN__SECRET` | JSON map of DIPLAN environment credentials (OIDC token URL, client secret, DMS base URL per env) | `{}` | no |
| `DIPLAN__CLIENT_ID` | DIPLAN OAuth client ID | — | no |
| `DIPLAN__SKIPPED_FILE_TYPES` | File extensions skipped during DIPLAN processing | `[".gml"]` | no |
| `FPP__KEYCLOAK_TOKEN_URL` | FPP OIDC token endpoint URL for password grant authentication | `""` | no |
| `FPP__CLIENT_ID` | FPP OAuth client ID | `""` | no |
| `FPP__CLIENT_SECRET` | FPP OAuth client secret | `""` | no |
| `FPP__USERNAME` | FPP service account username | `""` | no |
| `FPP__PASSWORD` | FPP service account password | `""` | no |
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
docker compose up --build
```

## API Endpoints

| Method | Path                              | Description                                |
| ------ | --------------------------------- | ------------------------------------------ |
| `GET` | `/healthz` | Lightweight health probe |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/startup` | Startup probe |
| `GET` | `/metrics` | Prometheus metrics endpoint |
| `POST` | `/workflows/diplan` | Start a DiPlan orchestration workflow |
| `POST` | `/workflows/anonymisierung` | Start an anonymization workflow |
| `POST` | `/workflows/fpp-download` | Start an FPP download workflow |
| `POST` | `/workflows/formale-pruefung`     | Start a formal completeness check workflow |
| `POST` | `/workflows/suz/{norm_id}` | Start a search-and-assignment workflow for a norm |
| `POST` | `/workflows/mvp` | Start a batch plausibility workflow |
| `POST` | `/workflows/bewertung` | Start an assessment workflow |
| `POST` | `/workflows/risikohinweise` | Start a risk-notes workflow |
| `POST` | `/workflows/cancel/{workflow_id}` | Cancel a running workflow                  |

Full interactive API documentation: http://localhost:8000/docs
