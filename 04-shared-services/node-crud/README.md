# Node-Crud-Library

A shared Python library for generating a FastAPI CRUD surface from SQLAlchemy node models.

## Core Features

- **Node model base:** Provides common node columns, soft-delete behavior, project scoping, and parent references.
- **Route generation:** Builds list, batch-get, and batched update endpoints from a SQLAlchemy declarative base.
- **Generated schemas:** Creates Pydantic request and response models for every registered node type.
- **Atomic mutations:** Executes batched insert, patch, and soft-delete operations in a single transaction.
- **Exception handling:** Provides FastAPI exception handlers for node lookup and payload validation errors.

## Architecture

### Overview

Node CRUD is imported by services that manage graph-like node tables. A consuming service defines its node models, calls `generate_node_routes(...)`, and mounts the returned `APIRouter` in its FastAPI application.

The generated SQL is PostgreSQL-specific. It uses JSONB records, partial indexes, and server-side JSON assembly to keep large node updates efficient.

### Components

- **Model base:** `create_node_base()` returns a fresh `(Base, NodeBase)` pair for a service.
- **Registry:** Discovers node models and parent relationships from the SQLAlchemy declarative base.
- **Schema builder:** Generates insert, patch, response, and envelope models for all registered node types.
- **Routes:** Mounts the generated FastAPI endpoints under the project-scoped path.
- **Service layer:** Builds and executes the underlying read and mutation SQL.

### Dependencies

| Module / Service | Purpose |
|------------------|---------|
| `fastapi` | Provides router and dependency integration. |
| `sqlalchemy` | Defines node models and builds SQL statements. |
| `pydantic` | Defines generated request and response schemas. |
| PostgreSQL | Required for the generated JSONB SQL. |
| **Audit-Client-Library** | Used by exception handlers and write paths that record audit events. |
| **Event-Logging-Library** | Used by registered exception handlers for structured logging. |

### Data Models

Every generated node model includes common system fields such as `id`, `project_id`, `is_deleted`, `frontend_parent_ids`, `update_type`, and timestamps. Service-specific fields are declared on normal SQLAlchemy model classes that inherit from the generated `NodeBase`.

For every registered node type, the schema builder creates response, insert, patch, reference, and batched action schemas. Request models reject unknown fields.

### API Endpoints

All generated endpoints are scoped under `/{project_id}/` and operate only on active rows for that project.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/{project_id}/nodes` | Streams the node graph as node references and parent links. |
| `POST` | `/{project_id}/batch-nodes` | Fetches full payloads for a list of node references. |
| `POST` | `/{project_id}/update` | Applies batched inserts, patches, and soft deletes atomically. |

See [`HTTP_API.md`](./HTTP_API.md) for request and response shapes.

## Project Structure

```
src/node_crud/
├── __init__.py      # Public API exports
├── base.py          # Node base, table args, and parent FK helpers
├── registry.py      # Model registry and parent discovery
├── schema.py        # Pydantic schema generation
├── service.py       # SQL builders and mutation service
├── routes.py        # FastAPI router generation
├── handlers.py      # Exception handler registration
└── exceptions.py    # Library exception types
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- FastAPI application in the consuming service
- SQLAlchemy async session dependency
- PostgreSQL database

### Installation

Add the package to the consuming service:

```toml
[tool.uv.sources]
node-crud = { workspace = true }
```

Then add `node-crud` to the service dependencies.

### Environment Variables

Node CRUD does not read environment variables directly. Database, authentication, and audit settings are owned by the consuming service and its dependencies.

### Running the Module / Service

#### In Development

1. Add `node-crud` as a workspace dependency.

2. Define node models using `create_node_base()` and `common_table_args(...)`.

3. Mount generated routes in the consuming service's FastAPI application.

4. Run the consuming service's normal local app command and verify the generated OpenAPI schema.

#### In Production

1. Package the consuming service with `node-crud` as a dependency.

2. Apply the consuming service's database migrations.

3. Start the consuming FastAPI service. Node CRUD has no standalone process.

## Usage

### Define Node Models

```python
import uuid

from node_crud import common_table_args, create_node_base
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

Base, NodeBase = create_node_base()


class Author(NodeBase):
    __tablename__ = "author"
    __table_args__ = common_table_args("author")

    name: Mapped[str] = mapped_column(String, nullable=False)


class Book(NodeBase):
    __tablename__ = "book"
    __table_args__ = common_table_args("book")

    author_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("author.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
```

A foreign key to another `NodeBase` table makes the model a child node. For cross-service parents without an enforced foreign key, declare `__external_parent_cols__ = {"col_name": "other_service_node_type"}`.

### Mount Routes and Handlers

```python
from fastapi import FastAPI
from node_crud import generate_node_routes, register_node_crud_handlers

from src.db import get_db_session
from src.models.db_models import Base
from src.utils.logger import logger

app = FastAPI()

app.include_router(
    generate_node_routes(
        base=Base,
        get_db_session=get_db_session,
    )
)

register_node_crud_handlers(app, logger)
```

Pass `add_write_endpoints=False` to `generate_node_routes(...)` for read-only services.

## Public API

| Group | Exports | Purpose |
|-------|---------|---------|
| Model setup | `create_node_base`, `NodeModelBase`, `common_table_args`, `parent_fk`, `UpdateType` | Define node tables and relationships. |
| Route setup | `generate_node_routes`, `register_node_crud_handlers` | Mount generated FastAPI routes and exception handlers. |
| Registry and schemas | `build_registries`, `build_generated_node_schemas`, `GeneratedNodeSchemas` | Inspect models and generate request/response types. |
| Service layer | `NodeService`, `CreateNodeChange`, `PatchNodeChange`, `DeleteNodeChange` | Use CRUD behavior directly outside generated routes. |
| Errors | `NodeNotFoundError`, `UnknownNodeTypeError`, `InvalidParentTypeError`, `InvalidPayloadError` | Handle validation and lookup failures. |

## Testing

Run the package tests from the repository root:

```bash
uv run --package node-crud pytest 04-shared-services/node-crud/tests
```

## Additional Notes

- Inserts, updates, and deletes in a single `/update` request are committed atomically.
- Reads filter out rows where `is_deleted IS true`.
- Unique constraints are rewritten to partial unique indexes so soft-deleted rows do not block new inserts with the same business key.
- Node types are sorted before schema construction so the generated OpenAPI schema is stable across restarts.
