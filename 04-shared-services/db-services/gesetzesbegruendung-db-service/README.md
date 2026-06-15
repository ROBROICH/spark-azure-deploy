# Dienst Gesetzesbegründungsdatenbank (Legal Explanations Database)

Database and API service for querying parliamentary explanatory materials and related legal background documents.

## Core Features

- **Ingestion:** Ingests explanatory materials from configured public-source pipelines.
- **Storage:** Stores documents, authors, references, and process relations in PostgreSQL.
- **Retrieval:** Exposes search and retrieval endpoints for downstream consumers.
- **Semantic Search:** Provides embedding-backed semantic retrieval for top-k document chunks.

## Architecture

### Overview

The service is built as a FastAPI application created through the shared app factory and extended with a database router for document retrieval and similarity search. On startup, it initializes the embedding client and prepares the application for vector-backed lookups.

In addition to the HTTP API, the service ships a CLI for ingestion pipelines that populate the database from configured sources.

### Temporal Workflows

- **UpdateBegruendungenWorkflow:** scheduled workflow that parses parliamentary explanations related to legal texts loaded in **Dienst Gesetze- und Normendatenbank**.

### Dependencies

The service depends on:
- PostgreSQL for persistent storage,
- **DB-Services-Shared-Library** for shared FastAPI, database, chunking, and embedding support,
- **Temporal–Shared-Library** for easier workflow/activity sharing,
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** for API auth,
- `anyascii` for text normalization during pipeline processing.

### Data Models

The database stores explanatory-material entities such as:
- **Document**, including:
  - optionally loaded **FullText**,
  - **Chunk** embeddings for similarity queries.

## API Endpoints

- `GET /documents/search` 
    Search available documents, filtering by `jurabk`, `drucksachetyp`, `herausgeber`.
- `GET /document` 
    Get a specific document (in Full) by `doknr`.
- `POST /query_top_k`
    Returns top `k` most similar chunks. Unique by section and filterable by `section_title` and `jurabk`.

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- A PostgreSQL instance
- A reachable **Dienst Gesetze- und Normendatenbank** if your workflow depends on cross-service lookups
- Access to the configured embedding endpoint

### Environment Variables

Configuration is loaded from environment variables and the shared settings model.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Application log level | — | no |
| `DB_HOST` | PostgreSQL host | — | yes |
| `DB_PORT` | PostgreSQL port | — | yes |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `CHUNKING_MODEL` | Embedding model name | — | yes |
| `CHUNKING_URL` | Base URL of the embedding endpoint | — | yes |
| `CHUNKING_SIZE` | Chunk size used during embedding preparation | 1024 | no |
| `CHUNKING_OVERLAP` | Overlap between chunks | — | no |
| `CHUNKING_APIKEY` | Authentication token for the embedding endpoint | — | yes |
| `GESETZE_NORMEN_URL` | Base URL of the **Dienst Gesetze- und Normendatenbank** | — | no |
| `CACHE_DIR` | Local cache directory | — | no |
| `AUTH_MODE` | Auth enforcement mode for the shared `authentification` package | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience / client ID | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Disable TLS for SpiceDB connection | `false` | no |

### Running the Service

#### In Development

1. Install dependencies:

```bash
uv sync --inexact
```

2. Apply database migrations:

```bash
uv run alembic upgrade head
```

3. Start the API:

```bash
uv run uvicorn begruendungen_db.service:app --host 0.0.0.0 --port 8000
```

The ingestion CLI is available through:

```bash
uv run begruendungen-db-cli --help
```

The repository also includes a `Makefile` and Docker Compose setup for local containerized workflows.

To start the temporal worker locally, refer to [process-compose.yaml](../../../process-compose.yaml) and the [root README](../../../README.md).

## Troubleshooting

Common local issues:
- If startup fails while initializing embeddings, it will run in degraded mode (similarity search not available); verify the chunking endpoint URL, model name, and API key.
- If migrations fail, confirm that PostgreSQL is reachable on the configured host and port.
- Changing the `CHUNKING_SIZE` parameter requires a database migration (and changes in `begruendungen_db/schemas/db.py`), as the DB column is fixed-width.
- A valid `GESETZE_NORMEN_URL` is only required for the worker.
