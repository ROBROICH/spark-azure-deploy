# Dienst juristische Datenbank (Court Decision Database)

API and ingestion service for court decisions and related data such as cited norms, reasoning sections, and similarity-search.

## Core Features

- **Court Decision Ingestion:** Ingesting and storing court decision documents.
- **Structured Data Access:** Exposing structured access to norms, regions, tenor, and reasoning sections.
- **Semantic Retrieval:** Supporting semantic retrieval through embedding-backed chunk queries.
- **CLI and Temporal Workflows:** Providing a CLI and Temporal workflows for ingestion.

## Architecture

### Overview

The service is implemented as a FastAPI application created through the shared app factory (`db-services-shared`), as well as a Temporal worker using the shared `temporal` package. 

API routes are backed by persisted court-decision entities and related substructures, while CLI/Temporal workflows support data ingestion and maintenance tasks outside the HTTP API.

### Temporal Workflows

- **UpdateRechtsprechungWorkflow:** workflow that parses all court decisions from configured administrative courts.

### Dependencies

The service depends on:
- PostgreSQL for persistent storage,
- **DB-Services-Shared-Library** (`db-services-shared[llm]`) for shared FastAPI, database, and embedding infrastructure,
- **Temporal–Shared-Library** for easier workflow/activity sharing,
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** for API auth,
- `typer` for CLI commands,
- `xsdata` and `defusedxml` for parsing structured legal data.

### Data Models

The database stores legal research entities such as:
- court decision documents,
- cited norms,
- reasoning sections,
- chunks used for semantic search.

## API Endpoints

Representative API routes include:

- `GET /documents/by-norm`
	Finds decisions that reference a specific norm.
- `GET /documents/{doc_id}`
	Returns a single decision document.
- `GET /documents/{doc_id}/complete`
	Returns a complete document view with nested content.
- `GET /norms/`
	Returns cited norms.
- `GET /tenor/`
	Returns operative sections of decisions.
- `GET /gruende/`
	Returns reasoning sections.
- `POST /chunks`
	Get all chunks, filtered by `aktenzeichen` and `section_number`.
- `POST /query_k_results`
    Returns top `k` most similar chunks. Unique by section and filterable by `section_title` and `jurabk`.

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- A PostgreSQL instance
- Optional access to the **Dienst Gesetze- und Normendatenbank** for cross-service workflows
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
| `CHUNKING_SIZE` | Chunk size used for similarity preparation | 1024 | no |
| `CHUNKING_OVERLAP` | Overlap between stored chunks | — | yes |
| `CHUNKING_APIKEY` | Authentication token for the embedding endpoint | — | yes |
| `CHUNKING_TIMEOUT` | Timeout for chunking and embedding calls | — | no |
| `GESETZE_NORMEN_URL` | Base URL of the Gesetze-und-Normen service | — | no |
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
uv run uvicorn jura_db.service:app --host 0.0.0.0 --port 8000
```

The CLI is available through:
```bash
uv run jura-db-cli --help
```

The repository also includes a `Makefile` and Docker Compose setup for local containerized workflows.

To start the temporal worker locally, refer to [process-compose.yaml](../../../process-compose.yaml) and the [root README](../../../README.md).

## Troubleshooting

Common local issues:
- If startup fails while initializing embeddings, it will run in degraded mode (similarity search not available); verify the chunking endpoint URL, model name, and API key.
- If migrations fail, confirm that PostgreSQL is reachable on the configured host and port.
- Changing the `CHUNKING_SIZE` parameter requires a database migration (and changes in `jura_db/schemas/db.py`), as the DB column is fixed width.
- A valid `GESETZE_NORMEN_URL` is only required for the worker.
