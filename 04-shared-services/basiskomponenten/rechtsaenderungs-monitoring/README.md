# Dienst Rechtsänderungsmonitoring (Legal Change Monitoring Service)

Service and scheduled Temporal workflow for monitoring official gazettes and surfacing pending updates for laws and norms.

## Core Features

- **Feed Parsing:** Parses configured legal source feeds for incoming legal changes.
- **Update Tracking:** Tracks pending updates for norms stored in the `Gesetze-und-Normen` database.
- **LLM Enrichment:** Enriches updates, ensuring there is always both the changed norm text and the text describing the change.
- **REST API:** Exposes a FastAPI API for querying pending legal changes and current feed entries.

## Architecture

### Overview

The service is implemented as a FastAPI application created through the shared **DB-Services-Shared-Library** app factory. Lifecycle events ensure migrations are applied before the API begins handling requests.

### Temporal Workflows

- **MonitorRechtsaenderungenWorkflow:** scheduled workflow that parses official gazettes and creates database entries for changes to legal texts loaded in **Dienst Gesetze- und Normendatenbank**

### Dependencies

The service depends on:
- PostgreSQL for persistent storage,
- **DB-Services-Shared-Library** for shared database and FastAPI
- **LLM-Client-Library** for proxying llm calls in Temporal,
- **Temporal–Shared-Library** for easier workflow/activity sharing,
- **Dienst Gesetze- und Normendatenbank** API reachable through `GESETZE_NORMEN_URL`,
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** for API auth.
- `feedparser` for RSS and feed parsing,
- `pypdf`, `pdfplumber`, `markdownify`, and `html2text` for legal document extraction and conversion,

### Data Models

- **`Document`:** Stores metadata about the official gazette that published the changes.
- **`Norm`:** Describes pending changes to an existing norm.

## API Endpoints

Main API route:
- `GET /pending-updates`
	Returns pending norm updates and supports filtering with `jurabk`, `paragraph_nr`.
    Simple and detailed responses can be switched via the `detail` query parameter.

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- A PostgreSQL instance
- Access to a **Dienst Gesetze- und Normendatenbank** endpoint
- Optional LLM provider configuration if you want to run the monitoring workflow

### Environment Variables

The service reads configuration overrides from environment variables.

Common settings include:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Application log level | — | no |
| `DB_HOST` | PostgreSQL host | — | yes |
| `DB_PORT` | PostgreSQL port | — | yes |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `GESETZE_NORMEN_URL` | Base URL of the **Dienst Gesetze- und Normendatenbank** | — | yes |
| `LLM_CATEGORISATION_MODEL` | Smaller model used for categorization | — | no |
| `LLM_SUMMARISATION_MODEL` | Main model used for change summarization | — | no |
| `LLM_ENRICHMENT_MODEL` | Model used for enrichment | - | no |
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

2. Start the API (migrations are applied automatically on startup):
```bash
uv run uvicorn rechtsaenderungsmonitoring.service:app --host 0.0.0.0 --port 8000
```

The repository also includes a `Makefile` and Docker Compose setup for local containerized workflows.

To start the temporal worker locally, refer to [process-compose.yaml](../../../process-compose.yaml) and the [root README](../../../README.md).

## Troubleshooting

Common local issues:
- If migrations fail, confirm that PostgreSQL is reachable on the configured host and port.
