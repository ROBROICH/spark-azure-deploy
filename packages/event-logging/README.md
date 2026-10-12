# Event-Logging-Library (Event Logging Library)

A shared Python library providing ECS-compatible structured JSON logging for FastAPI services. Covers HTTP request/response logging, database operation logging, and manual business event logging.

> **Note**: This is an in-process library, not a deployed service. It has no `k8s/` overlay and no `.env.example`. The variables below are read by `LoggingSettings` in consuming services; they should be set on the consuming service's deployment, not here.

## Core Features

- **HTTP logging:** Captures request and response metadata through FastAPI middleware.
- **Database logging:** Logs SQLAlchemy query, transaction, and rollback events.
- **Manual event logging:** Provides typed business event logging helpers.

## Architecture

### Overview

**Event-Logging-Library** is a workspace package consumed by backend services. It is configured in the consuming service and does not run as a separate deployment.

## Getting Started

### Prerequisites

- A consuming FastAPI service
- `fastapi` and `starlette` installed in the consuming service when using middleware

## Installation

This is a workspace package. Services in the monorepo depend on it via `pyproject.toml`:

```toml
[tool.uv.sources]
event-logging = { workspace = true }
```

## Setup

### 1. FastAPI Middleware

Captures HTTP requests, responses, durations, and errors automatically.

> Requires `fastapi` and `starlette` to be installed separately.

```python
from fastapi import FastAPI
from event_logging.middleware import EventLoggingMiddleware

app = FastAPI()

app.add_middleware(
    EventLoggingMiddleware,
    service_name="my-service",
    skip_paths=["/healthz", "/metrics"]  # Optional
)
```

### 2. Database Event Listeners (SQLAlchemy)

Automatically logs SQL queries, durations, commits, and rollbacks.

```python
from sqlalchemy.ext.asyncio import create_async_engine
from event_logging.db_logging import setup_db_logging

engine = create_async_engine("postgresql+asyncpg://...")
setup_db_logging(engine, service_name="my-service")
```

### 3. Manual Logging

For business logic events:

```python
from event_logging import EventLogger, EventAction, EventCategory, EventOutcome

logger = EventLogger(service_name="my-service")

logger.info(
    action=EventAction.READ,
    category=EventCategory.API,
    outcome=EventOutcome.SUCCESS,
    message="User profile fetched",
    extra={"user_id": "123"}
)
```

### Running the Service

This package is an in-process library and has no standalone entry point. It runs inside consuming FastAPI services — no separate startup step is required.

### Environment Variables

Configure via environment variables (`EVENT_LOGGING_...`) or `LoggingSettings`:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EVENT_LOGGING_ECS_VERSION` | ECS schema version (prefix `EVENT_LOGGING_` reflects the `LoggingSettings` config) | `8.11.0` | no |
| `ENV` | Environment name (`development`, `production`); enables pretty-print log formatting in development | `production` | no |
| `LOG_LEVEL` | Minimum emitted severity; case-insensitive. Supports `DEBUG`, `INFO`, `WARN`/`WARNING`, `ERROR`, and `FATAL`/`CRITICAL`. SQL statement events require `DEBUG`; bound values and driver detail remain excluded. | `INFO` | no |
