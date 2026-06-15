# Dienst Fachplanungsportal-Integration (Service FPP Integration)

FastAPI microservice for Fachplanungsportal integration. It receives project creation requests from the FPP platform, processes the data, and creates projects in **Dienst Verfahrensverwaltung**.

> **Disclaimer:** In the long term, all services that connect SPARK Workflow to external platforms – including this adapter – are planned to be moved out of the main repository into separate repositories.

## Core Features

- **FPP integration:** Receives project creation requests from the FPP platform.
- **XML processing:** Parses FPP XML data to extract project information.
- **Address parsing:** Parses combined address fields.
- **Project creation:** Integrates with **Dienst Verfahrensverwaltung** to create projects.
- **File management:** Stores file URLs for planning documents and supplementary documents.
- **Status tracking:** Tracks request processing status (`RECEIVED`, `PROCESSING`, `COMPLETED`, `FAILED`).

## Architecture

### Overview

**Dienst Fachplanungsportal-Integration** accepts external FPP project creation requests, stores request state in PostgreSQL, and calls **Dienst Verfahrensverwaltung** to create project records.

### Components

- **API routes:** Expose external FPP and internal lookup endpoints.
- **Request processing:** Parses incoming XML payloads and maps them to project data.
- **Persistence:** Stores request status and extracted file URLs.

### Dependencies

| Module / Service | Purpose |
| ---------------- | ------- |
| PostgreSQL | Primary data store |
| **Dienst Verfahrensverwaltung** | Creates project records |
| **Dienst Agentenorchestrierung** | Optional downstream service configured for orchestration callbacks |

### API Endpoints

- `POST /external/fpp/projects`: Create a new project from FPP.
- `GET /internal/fpp/requests/{request_id}`: Get request details.
- `GET /internal/fpp/files/{request_id}`: Get file URLs for a request.
- `POST /internal/fpp/files/{file_id}/confirm-download`: Confirm that a file was downloaded.
- `GET /healthz`: Lightweight health probe.
- `GET /readyz`: Readiness probe.
- `GET /startup`: Startup probe.
- `GET /metrics`: Prometheus metrics endpoint.

### Idempotency and Retry Logic

The service implements idempotency handling:

- **Completed requests:** Return the existing result without retrying.
- **Processing or received requests:** Return the existing request state to prevent duplicates.

This supports safe retries and prevents duplicate project creation.

## Getting Started

### Prerequisites

- `uv` package manager
- PostgreSQL
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Service identifier | `fpp-service` | no |
| `BACKEND_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` | no |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods | `GET,POST,PATCH,DELETE,OPTIONS` | no |
| `DB_USER` | PostgreSQL user | `""` | yes (when starting the app) |
| `DB_PASSWORD` | PostgreSQL password | `""` | yes (when starting the app) |
| `DB_HOST` | PostgreSQL host | `localhost` | no |
| `DB_PORT` | PostgreSQL port | `5432` | no |
| `DB_NAME` | PostgreSQL database name | `""` | yes (when starting the app) |
| `PROJECT_LOGIC_SERVICE_URL` | URL to **Dienst Verfahrensverwaltung** | `http://project-logic-service:8000` | no |
| `AGENT_ORCHESTRATION_BASE_URL` | URL to **Dienst Agentenorchestrierung** | `http://agent-orchestration-service:8000` | no |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `DEFAULT_PROJECT_TYPE_ID` | Default project type UUID | `00000000-0000-0000-0000-000000000000` | no |
| `SYSTEM_USER_ID` | UUID used as the system user for created records | `00000000-0000-0000-0000-000000000001` | no |
| `LOG_LEVEL` | Python logging level *(deployment-injected)* | `INFO` | no |

### Running the Service

#### In Development

```bash
# Install dependencies
uv sync

# Run migrations
uv run alembic upgrade head

# Run service
uv run uvicorn src.main:app --reload --port 8000
```

#### In Production

```bash
# Build
docker build -t fpp-service .

# Run
docker compose up
```
