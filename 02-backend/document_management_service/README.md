# Dienst Dokumentenmanagementsystem (Document Management Service)

A FastAPI microservice for storing, retrieving, and managing documents in S3-compatible object storage, with Temporal-based workflow support for file processing and approvals.

## Core Features

- **File management:** Uploads, downloads, lists, and deletes documents via presigned URLs; supports versioning and soft deletion.
- **Storage backend:** Uses S3-compatible object storage for document persistence.
- **Approval workflows:** Manages document approval states via Temporal.
- **ZIP processing:** Accepts ZIP archives and extracts them via a Temporal workflow.

## Architecture

### Overview

Document metadata is stored in PostgreSQL, document content is stored in S3-compatible object storage, and Temporal coordinates ZIP processing, approvals, and large-payload handling.

### Dependencies

| Service                      | Purpose                               |
| ---------------------------- | ------------------------------------- |
| PostgreSQL                   | File metadata store                   |
| S3-compatible object storage | Document storage backend              |
| Temporal                     | ZIP processing and approval workflows |

### Storage

Documents are stored in S3-compatible object storage under the configured bucket and document path. Presigned upload and download URLs use the configured external S3 URL so browser clients can reach the storage backend.

### Retention Cleanup

Temporal checkpoint files are automatically cleaned up after `CHECKPOINT_RETENTION_PERIOD_DAYS` days.

### Adding a New File Type

1. Add the value to `FileTypeEnum` in `src/models/db/file_enum.py`
2. Add any required columns to the `File` model and run migrations
3. Add a Pydantic upload schema and include it in the discriminated union
4. Implement a `PathBuilder` subclass and register it in `PathBuilderFactory`
5. Add the new fields to `FileResponse`

### Docker & Docker Compose

```bash
docker compose up --build

# Subsequent runs
docker compose up -d
```

### API Endpoints

#### Files

| Method   | Path                                        | Description                                    |
| -------- | ------------------------------------------- | ---------------------------------------------- |
| `POST`   | `/v2/files/generate-upload-url`             | Generate a presigned upload URL                |
| `POST`   | `/v2/files/confirm-upload`                  | Confirm upload and persist metadata            |
| `POST`   | `/v2/files/start-file-processing`           | Start Temporal processing for an uploaded ZIP  |
| `GET`    | `/v2/files`                                 | List files (filterable by type, project, name) |
| `GET`    | `/v2/files/{file_id}`                       | Get file metadata                              |
| `GET`    | `/v2/files/{file_id}/versions`              | List versions of a file                        |
| `PATCH`  | `/v2/files/{file_id}`                       | Update file metadata                           |
| `DELETE` | `/v2/files/{file_id}`                       | Soft delete a file                             |
| `GET`    | `/v2/files/{file_id}/generate-download-url` | Generate a presigned download URL              |

#### Approvals

| Method | Path                                  | Description                                      |
| ------ | ------------------------------------- | ------------------------------------------------ |
| `GET`  | `/v2/files/{file_id}/approval-status` | Get current approval status                      |
| `POST` | `/v2/files/{file_id}/decision`        | Submit approval decision (`approve` or `reject`) |
| `GET`  | `/v2/files/{file_id}/diff`            | Get file diff from running workflow              |
| `POST` | `/v2/files/{file_id}/diff`            | Set file diff in running workflow                |
| `POST` | `/v2/files/{file_id}/cancel`          | Cancel a running upload workflow                 |

#### Internal Files

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/v2/internal/files/generate-upload-url` | Generate an internal upload URL |
| `POST` | `/v2/internal/files/confirm-upload` | Confirm an internal upload |
| `GET` | `/v2/internal/files/{project_id}/zips/{zip_file_id}/diff` | Get an internal ZIP diff |
| `PATCH` | `/v2/internal/files/{project_id}/zips/{zip_file_id}/approval-status` | Update an internal ZIP approval status |
| `POST` | `/v2/internal/files/{project_id}/zips/{zip_file_id}/commit-diff` | Commit an internal ZIP diff |

#### ZIP Files

| Method | Path                          | Description           |
| ------ | ----------------------------- | --------------------- |
| `GET`  | `/v2/zip-files`               | List ZIP files        |
| `GET`  | `/v2/zip-files/{zip_file_id}` | Get ZIP file metadata |

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
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

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

Nested settings (Temporal, ClamAV) use `__` as the delimiter, e.g. `TEMPORAL__HOST`.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENV` | Runtime environment used for fail-closed guards and logging conventions | — | yes |
| `SERVICE_NAME` | Service identifier used for logging and middleware | — | yes |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name used by the shared Temporal worker | — | yes |
| `OTEL_ENDPOINT` | OpenTelemetry collector gRPC endpoint used by the shared Temporal worker | — | yes |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `DB_NAME` | PostgreSQL database name | — | yes |
| `DB_HOST` | PostgreSQL host | — | yes |
| `DB_PORT` | PostgreSQL port | — | yes |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | — | yes |
| `ALLOWED_HTTP_METHODS` | Allowed HTTP methods for CORS configuration | `["GET","POST","PATCH","DELETE","OPTIONS"]` | no |
| `BLOCKED_HTTP_METHODS` | HTTP methods blocked by middleware | `{"TRACE","PUT"}` | no |
| `MAX_ZIP_EXTRACTION_SIZE_GB` | Maximum total extracted size from a ZIP archive (GB) | — | yes |
| `MAX_SINGLE_ENTRY_SIZE_MB` | Maximum size of a single ZIP entry (MB) | — | yes |
| `MAX_ZIP_ENTRIES` | Maximum number of entries allowed in a ZIP archive | — | yes |
| `MAX_COMPRESSION_RATIO` | Maximum allowed ZIP compression ratio (zip-bomb guard) | — | yes |
| `PUBLIC_ALLOWED_FILE_TYPES` | Allowed public document file types | configured in code | no |
| `PUBLIC_ALLOWED_FILE_EXTENSIONS` | Allowed public document file extensions by file type | configured in code | no |
| `ERWIDERUNGS_ALLOWED_FILE_TYPES` | Allowed response document file types | configured in code | no |
| `ERWIDERUNGS_ALLOWED_FILE_EXTENSIONS` | Allowed response document file extensions by file type | configured in code | no |
| `ZIP_ENTRY_ALLOWED_FILE_TYPES` | Allowed file types inside ZIP archives | configured in code | no |
| `ZIP_ENTRY_ALLOWED_FILE_EXTENSIONS` | Allowed file extensions inside ZIP archives by file type | configured in code | no |
| `ALLOWED_FILE_TYPES` | Combined allowed file type set derived from the type-specific settings | derived | no |
| `ALLOWED_FILE_EXTENSIONS` | Combined allowed file extension mapping derived from the type-specific settings | derived | no |
| `BUCKET_NAME` | Object storage bucket name | — | yes |
| `DOC_STORE_PATH` | Base path prefix inside the bucket | — | yes |
| `S3_ACCESS_KEY_ID` | S3 access key | `None` | conditional |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | `None` | conditional |
| `S3_ENDPOINT_URL` | S3 API endpoint | `None` | conditional |
| `S3_EXTERNAL_URL` | External S3 URL used for presigned URLs | `None` | conditional |
| `S3_REGION` | S3 region | `None` | no |
| `CHECKPOINT_RETENTION_PERIOD_DAYS` | Days to retain Temporal checkpoint data | — | yes |
| `PROJECT_LOGIC_SERVICE_URL` | Base URL of **Dienst Verfahrensverwaltung** | — | yes |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL of **Dienst Workflowmanagement** | — | yes |
| `TEMPORAL__HOST` | Temporal server address, e.g. `localhost:7233` | — | yes |
| `TEMPORAL__TASK_QUEUE` | Temporal task queue name | — | yes |
| `TEMPORAL__PLS_TASK_QUEUE` | **Dienst Verfahrensverwaltung** task queue used by DMS workflows | — | yes |
| `TEMPORAL__NAMESPACE` | Temporal namespace | — | yes |
| `TEMPORAL__S3_BUCKET_NAME` | S3 bucket for Temporal large-payload codec | — | yes |
| `TEMPORAL__S3_ENDPOINT_URL` | S3 endpoint for Temporal payloads | — | yes |
| `TEMPORAL__S3_ACCESS_KEY_ID` | S3 access key for Temporal payloads | — | yes |
| `TEMPORAL__S3_SECRET_ACCESS_KEY` | S3 secret key for Temporal payloads | — | yes |
| `TEMPORAL__S3_REGION` | S3 region for Temporal payloads | — | yes |
| `TEMPORAL__ENABLE_APPROVAL` | Enable approval workflows | — | yes |
| `CLAMAV__ENABLED` | Enable ClamAV virus scanning | `false` | no |
| `CLAMAV__BASE_URL` | ClamAV API base URL | `http://clamav-api.clamav-system.svc.cluster.local:6000` | no |
| `CLAMAV__TIMEOUT_SECONDS` | ClamAV scan timeout (seconds) | `600` | no |
| `QUARANTINE_BUCKET_NAME` | Quarantine bucket name (required when `CLAMAV__ENABLED=true`) | `""` | conditional |
| `QUARANTINE_S3_ACCESS_KEY_ID` | Quarantine S3 access key (required when `CLAMAV__ENABLED=true`) | `None` | conditional |
| `QUARANTINE_S3_SECRET_ACCESS_KEY` | Quarantine S3 secret key (required when `CLAMAV__ENABLED=true`) | `None` | conditional |
| `QUARANTINE_S3_ENDPOINT_URL` | Quarantine S3 endpoint (required when `CLAMAV__ENABLED=true`) | `None` | conditional |
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
# Start shared services from repo root
docker compose -f ../../docker-compose.yaml up -d

# Start the service
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir src
```

- **API docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/healthz
- **Metrics**: http://localhost:8000/metrics

## Database Migrations

```bash
# Apply migrations
uv run alembic upgrade head

# Generate a new migration
uv run alembic revision --autogenerate -m "description"
```
