# Dienst Gesetze- und Normendatenbank (Law and Norm Database)

API and ingestion workflow for storing and querying laws, norms, legal definitions, and related document metadata from public sources.

## Core Features

- **Law and norm ingestion:** Ingests laws and norms from configured sources.
- **Legal document storage:** Stores legal documents and structural metadata in PostgreSQL.
- **HTTP API:** Exposes HTTP endpoints for document, norm, paragraph, table-of-contents, and annex retrieval.
- **CLI and Temporal workflow support:** Supports processing through a CLI or Temporal workflows.

## Architecture

### Overview

The service is a FastAPI application created through the **DB-Services-Shared-Library** app factory and backed by a SQLModel-based ORM. Lifecycle events ensure migrations are applied before the API begins handling requests.

### Temporal Workflows

- **UpdateRechtsgrundlageWorkflow:** Orchestrator workflow for all sources.
- **UpdateRechtsgrundlageSourceWorkflow:** workflow that parses legal texts from configured public sources.


### Dependencies

The service depends on:
- PostgreSQL for persistent storage,
- **DB-Services-Shared-Library** for shared FastAPI and database infrastructure,
- **Temporal–Shared-Library** for easier workflow/activity sharing,
- **OIDC- & OAuth 2.0-konformer Identitäts- und Autorisierungsdienst** for API auth,
- `typer` for CLI commands,
- `httpx`, `beautifulsoup4`, `markdownify`, `defusedxml`, `anyascii`, `playwright` for Ingestion and normalization pipelines.


### Data Models

The database stores legal information such as:
- documents and document metadata,
- norms, split into separate paragraphs and atomic sentences,
- technical norms metadata,
- legal definitions,
- tables of contents and annexes,
- document history, versioned by unique hash of the document.

## Getting Started

### Prerequisites

To run the service locally, you need:
- Python `>=3.13, <3.14`
- `uv` package manager
- a PostgreSQL instance

### Environment Variables

Configuration is loaded from the shared settings model and environment variables.

Common settings include:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | PostgreSQL host | — | yes |
| `DB_PORT` | PostgreSQL port | — | yes |
| `DB_USER` | PostgreSQL user | — | yes |
| `DB_PASSWORD` | PostgreSQL password | — | yes |
| `AUTH_MODE` | Auth enforcement mode for the shared `authentification` package | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_REALM` | OIDC realm | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_AUDIENCE` | Expected JWT audience / client ID | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key | — | yes unless `AUTH_MODE=disabled` |
| `AUTH_SPICE_DB_INSECURE` | Disable TLS for SpiceDB connection | `false` | no |

Pipeline-specific source selection is configured through the JSON files in `pipeline_configs/`.

### Running the Service

#### In Development

Install dependencies and prepare the local environment:

```bash
uv sync --inexact
```

Apply database migrations before the first run:

```bash
uv run alembic upgrade head
```

Run the API locally with:

```bash
uv run uvicorn db_pipelines.service:app --host 0.0.0.0 --port 8000
```

The ingestion CLI is available through:

```bash
uv run db-cli --help
```


## Troubleshooting

<details>
<summary>Startup fails — PostgreSQL is not reachable</summary>

Confirm that PostgreSQL is reachable with the configured connection settings, check any `.env` or `.env.local` files as these are automatically loaded.

</details>

<details>
<summary>Ingestion workflows fail — pipeline configuration not found or invalid</summary>

Ensure the selected pipeline configuration file exists and matches the expected source structure (see [PipelineConfig](db_pipelines/config.py)).

</details>

## Disclaimer

This repository contains source code released under the EUPL-1.2. It does not include or distribute any third-party content such as legal texts, database records, or copies of web pages. To decrease the barrier to entry for the open source community, the federal laws (Bundesgesetze) are provided as part of the quick start.

The parsing components are generic tools. They are not bound to, configured for, or dedicated to any specific data source, and the code contains no source-specific endpoints, URLs, or target definitions. A connection to a concrete data source is established only through configuration supplied by the party that deploys the software.

Configuring the parsers, including the selection of target sources and the provision of any URLs or endpoints, is the responsibility of the operator or user who deploys and runs the software. The maintainers do not predetermine, recommend, or endorse any particular target source.

The legal assessment of any concrete operation carried out with this software, including the retrieval, processing, storage, and reuse of data, is the responsibility of the operator or user. This covers compliance with applicable database rights, the terms of use of any accessed service, and all other applicable law. Operators are responsible for verifying that both their chosen sources and their intended use are permitted.

The software does not implement, and must not be configured or extended to implement, the circumvention of effective technical protection measures or access controls of any third-party service.

The software is provided "as is", without warranty of any kind, as set out in the EUPL-1.2.

The table below shows which parsers were tested for accessing the laws of the respective jurisdiction.

| Parser           | Länder |
| ---------------- | ------ |
| `EuLexProcessor` | EU |
| `XmlProcessor1`  | Bund |
| `XmlProcessor2`  | Bayern |
| `BsProcessor1`   | Brandenburg |
| `BsProcessor2`   | Bremen |
| `BsProcessor3`   | Sachsen |
| `JsonProcessor1` | Niedersachsen, Nordrhein-Westfalen |
| `PwProcessor1`   | Baden-Württemberg, Berlin, Hamburg, Hessen, Mecklenburg-Vorpommern, Rheinland-Pfalz, Saarland, Sachsen-Anhalt, Schleswig-Holstein, Thüringen |
