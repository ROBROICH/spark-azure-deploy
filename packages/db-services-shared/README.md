# DB-Services-Shared-Library

Shared boilerplate and utilities for building legal database microservices: FastAPI application factory, async PostgreSQL session management, Alembic migration helpers, LLM/embedding clients, and common middleware.

## Core Features

- **FastAPI Application Factory:** `app_factory` bootstraps a fully configured FastAPI app with security headers, CORS, event-logging middleware, Prometheus metrics, health/readiness probes, and global exception handlers in a single call.
- **Async Database Session Management:** Provides an async SQLAlchemy engine and session factory (`init_database`, `get_db_session`, `get_async_session_factory`) backed by `asyncpg` with connection pooling.
- **Alembic Migration Helpers:** `run_alembic_upgrade` and `run_alembic_downgrade` wrap Alembic CLI calls so services can apply or roll back schema migrations at startup.
- **Lifespan Decorator:** `with_migration_lifespan` wraps a FastAPI lifespan context manager to run Alembic migrations before the application starts and tracks startup completion via `AppState`.
- **LLM (Embedding Clients - optional extra):** `EmbeddingClient` provides a provider-agnostic interface to **LLM-Proxy** (LiteLLM) and a test-fake provider, backed by LangChain and `pgvector`.
- **Dokumentenvorverarbeitung Client:** `DoclingApiDoc`, `pdf_to_doc`, and `extract_sections_from_doc` call the **Dokumentenvorverarbeitung** API to convert PDFs to structured text and sections, with local JSON caching.
- **Gesetze-Normen-DB Client:** `GesetzeNormenDB` provides a typed HTTP client for querying the **Dienst Gesetze- und Normendatenbank** to look up norm abbreviations (Jurabk) and name variations.
- **Common Middleware:** CORS middleware, security-headers middleware (CSP, HSTS, X-Frame-Options, etc.), and Prometheus FastAPI instrumentation.
- **Shared Exceptions:** `NotFoundError` and `OperationFailedError` with registered global exception handlers mapping them to standard HTTP responses.
- **Structured Logging:** Thin wrapper around the **Event-Logging-Library** `EventLogger` for consistent structured log events.

## Architecture

### Overview

The library is consumed as a `uv` workspace dependency by every legal database service (e.g. **Dienst Gesetzesbegründungsdatenbank**, **Dienst Gesetze- und Normendatenbank**, **Dienst juristische Datenbank**). It centralizes the infrastructure concerns that would otherwise be duplicated: application bootstrapping, database connectivity, schema migration, observability, and LLM integration. Each consuming service passes its own `CommonSettings` subclass (or the base class directly) into `app_factory` or `init_database` and receives a ready-to-use FastAPI application or session factory.

### Components

- **`fastapi.py` — Application Factory:** `app_factory` wires together all middleware, Prometheus instrumentation, probe routes, and exception handlers.
- **`config/settings.py` — Common Settings:** `CommonSettings` (Pydantic Settings) and `PostgresConfig` provide a shared configuration schema loaded from environment variables or `.env` files.
- **`config/llm.py` — LLM Config:** `LLMConfig`, `ChatConfig`, and `ChunkingConfig` Pydantic models for LLM provider settings.
- **`models/db/database.py` — Database Layer:** Async SQLAlchemy engine and session lifecycle management.
- **`models/db/migrate.py` — Migration Runner:** Alembic upgrade/downgrade helpers.
- **`api/routes/probe_router.py` — Health Probes:** `/healthz`, `/ready`, and `/startup` endpoints for Kubernetes liveness, readiness, and startup probes.
- **`api/middlewares/` — Middleware:** CORS and security-header middleware.
- **`exceptions/` — Exception Handling:** Common exception types and FastAPI global handlers.
- **`llm/` — LLM Clients (optional `llm` extra):** `EmbeddingClient` (text embeddings with pgvector support).
- **`utils/docling.py` — Document Conversion Client:** HTTP client for the **Dokumentenvorverarbeitung** API; parses and caches conversion results.
- **`utils/gesetze_normen.py` — Norm Lookup Client:** HTTP client for the **Dienst Gesetze- und Normendatenbank**.
- **`utils/parsing.py` — Parsing Utilities:** Helper function for sorting paragraph identifiers (e.g. `§ 10a`).
- **`utils/lifespan.py` — Lifespan Decorator:** Wraps FastAPI lifespan to run migrations and track `AppState.startup_complete`.
- **`utils/logging.py` — Logger Factory:** Returns a structured `EventLogger` from the **Event-Logging-Library**.

### Dependencies

| Module / Service | Purpose |
|---------|---------|
| **Event-Logging-Library** | Structured event logging middleware and `EventLogger` used throughout the library |
| **Temporal–Shared-Library** | Pulled in as a workspace dependency (available to consuming services) |
| **Dienst Gesetze- und Normendatenbank** | Queried at runtime by `GesetzeNormenDB` to resolve norm abbreviations |
| **Dokumentenvorverarbeitung** | Queried at runtime by `pdf_to_doc` to convert PDFs to structured text |
| **LLM-Proxy** | Targeted by `EmbeddingClient` for LLM and embedding calls (optional `llm` extra) |
| **Relationale Datenspeicherung** (PostgreSQL) | Backing store for all consuming services; connection managed by this library |
| **Prometheus-Metrics-kompatibler Metrikdienst** | Metrics are exposed via `prometheus-fastapi-instrumentator` on the `/metrics` endpoint |

### Data Models

- **`PostgresConfig`** — holds individual PostgreSQL connection parameters (`host`, `port`, `user`, `password`, `name`, `pool_size`, `max_overflow`) and exposes `.dsn` / `.async_dsn` properties.
- **`CommonSettings`** — base Pydantic Settings class with `SERVICE_NAME`, `log_level`, `BACKEND_CORS_ORIGINS`, `ALLOWED_HTTP_METHODS`, and a nested `db: PostgresConfig`. Loaded from environment variables with `_` as the nested delimiter.
- **`LLMConfig` / `ChatConfig` / `ChunkingConfig`** — LLM provider, model name, API key, URL, timeout, chunk size, overlap, and embedding dimensions.
- **`DoclingConfig`** — Docling API URL, optional Keycloak token endpoint, client credentials, and request timeout.
- **`GNDoc`** — Represents a law document record from **Dienst Gesetze- und Normendatenbank** with fields `doknr`, `hierarchy`, `jurabk`, `kurzue`, `langue`, `doktyp`.
- **`CheckResponse` / `HealthStatus`** — Probe endpoint response schemas.

- **`constants.py`** — Holds shared constants such as a Bundesland enum.

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager

### Installation

This is a workspace package. Add it to a service's `pyproject.toml`:

```toml
[tool.uv.sources]
db-services-shared = { workspace = true }
```

Then add `db-services-shared` to the service's dependencies:

```toml
[project]
dependencies = [
    "db-services-shared",
]
```


### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_NAME` | Name reported in logs and FastAPI title | `db-services` | no |
| `LOG_LEVEL` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`) | `INFO` | no |
| `BACKEND_CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `""` (none) | no |
| `ALLOWED_HTTP_METHODS` | HTTP methods to allow via CORS | `["POST", "OPTIONS"]` | no |
| `DB_USER` | PostgreSQL username | `postgres` | no |
| `DB_NAME` | PostgreSQL database name | `""` | yes |
| `DB_PASSWORD` | PostgreSQL password | `postgres` | no |
| `DB_HOST` | PostgreSQL host | `localhost` | no |
| `DB_PORT` | PostgreSQL port | `15432` | no |
| `DB_POOLSIZE` | SQLAlchemy connection pool size | `10` | no |
| `DB_MAXOVERFLOW` | SQLAlchemy max overflow connections | `5` | no |
| `SKIP_DOTENV` | Set to any value to skip loading `.env` / `.env.local` files | — | no |

### Running the Service

This is a shared library, not a standalone service. It is consumed as a dependency by other services in the workspace.

#### In Development

1. The library is part of the `uv` workspace. Consuming services declare it as a workspace source in their `pyproject.toml`:

    ```toml
    [tool.uv.sources]
    db-services-shared = { workspace = true }
    ```

2. Install dependencies in the consuming service (this will also install `db-services-shared` from the workspace):

    ```bash
    uv sync
    ```

3. To run the library's own tests:

    ```bash
    uv run pytest
    # or
    make test
    ```

#### In Production

The library is built and bundled into the Docker image of each consuming service via the `uv` workspace build. No separate deployment is needed.

## Testing

```bash
# Run all tests
uv run pytest
```

## Additional Notes

- The `llm` optional extra (`db-services-shared[llm]`) must be installed for `EmbeddingClient` and pgvector support. These features depend on `langchain[openai]`, `langsmith`, and `pgvector`.
- `pdf_to_doc` caches the **Dokumentenvorverarbeitung** API response as a `.docling` JSON file next to the source PDF to avoid redundant API calls on re-runs.
- `CommonSettings` reads from `.env.local` first, then `.env`. Set the `SKIP_DOTENV` environment variable to disable dotenv loading entirely (e.g. in CI or container environments).
- The `with_migration_lifespan` decorator ensures Alembic migrations run before the application begins serving traffic and sets `app_state.startup_complete = True` once the user lifespan function yields — this is what the `/startup` and `/ready` probes check.
