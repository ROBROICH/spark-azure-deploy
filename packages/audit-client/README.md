# Audit client

Records who changed what in a project, and passes that information from one process to the next. The package has two implementations that follow the same rules: this Python library and the [TypeScript library](typescript/README.md) in `typescript/`.

The TypeScript backend writes the change history. This Python library carries the same information through the Python AI modules, so that work done in a Temporal workflow stays linked to the user and the request that started it.

## Core Features

- Both implementations read and write the same six values: the user who made the change, the user who started it, the workflow run, the workflow type, the start time of the request, and the request ID.
- A shared test file, `fixtures/audit-context-vectors.json`, holds example inputs and the expected results. The Python and the TypeScript tests both run against it, so the two implementations cannot drift apart.
- The values travel between processes as HTTP headers and between workflow steps as Temporal headers.
- Each request and each Temporal task keeps its own copy of the values, so tasks that run at the same time never mix up their users.
- Invalid IDs and timestamps are dropped one by one. One bad value does not remove the others.

## Architecture

### Overview

#### The six values

| Value | HTTP header |
| --- | --- |
| User who made the change | `X-Actor-User-Id` |
| User who started it | `X-Triggered-By-User-Id` |
| Workflow run | `X-Workflow-Run-Id` |
| Workflow type | `X-Workflow-Type` |
| Start time of the request | `X-Request-Starttime` |
| Request ID | `X-Request-Id` |

User IDs and the request ID must be UUIDs, and the start time must be a valid timestamp. A value that does not match is dropped. Only the user ID from the verified login token is used as the acting user. Tokens and other login data are never part of these values.

| Task | Python | TypeScript |
| --- | --- | --- |
| Read the values from headers | `parse_audit_headers` in `audit_client.context` | `@spark-workflow/audit-client` |
| Keep a separate copy per task | `audit_context_scope` (Python `ContextVar`) | `withAuditContext` (Node `AsyncLocalStorage`) |
| Set the acting user from the login | `audit_identity_context` | `setAuditActor` |
| Add the values to outgoing calls | `merge_audit_headers` | `auditRequestInit` |
| Pass the values through Temporal | `ContextInterceptor` in `packages/temporal/python` | `@spark-temporal/typescript/context` |
| Write a history entry | `record_audit_entry` | `@spark-workflow/audit-client/persistence` |

#### Temporal workflows in Python

The `ContextInterceptor` in `packages/temporal/python/src/temporal/interceptors/context_interceptor.py` uses this library. It hooks into the Temporal client and worker, so workflow code does not need to pass these values itself:

1. When a workflow starts, the interceptor adds the acting user and the login token as Temporal headers (`x-actor-user-id`, `x-bearer-token`).
2. It passes these headers on to every task, local task, and sub-workflow.
3. When a task starts, it sets the acting user. With `set_audit_headers_context`, it also records who started the workflow, the workflow type, and the run of the first workflow in the chain. Inside the task, `current_audit_headers()` then returns these values as headers for outgoing calls.

#### Parts without a user today

The backend used to consist of separate Python services. From that time, the library still contains parts that no code in this repository uses anymore:

- `AuditContextMiddleware`, `audit_context_kwargs`, and `audit_actor_dependency` for FastAPI services.
- `record_audit_entry`, `record_audit_entries`, and `audit_log_table`, which write to the `audit_log` table with SQLAlchemy.
- `build_audit_change` and `build_audit_changes`.

The `audit_log` table now belongs to the TypeScript backend. Its Drizzle migrations create and change it. The Python write helpers only map the table and never create it.

### Components

| Module | Purpose |
| --- | --- |
| `context.py` | The six values, reading and checking them from headers, and the separate copy per task |
| `forwarding.py` | The values as headers for outgoing calls, and the copy that the Temporal interceptor sets |
| `workflow.py` | `WorkflowActorContext` and helpers to carry the values into workflows |
| `settings.py` | Header names that can be changed with environment variables |
| `middleware.py`, `dependencies.py` | FastAPI integration, without a user today |
| `client.py`, `models.py`, `changes.py`, `enums.py` | Writing history entries with SQLAlchemy, without a user today |

## Getting Started

### Prerequisites

- Python 3.13 and uv, set up through the [root setup guide](../../README.md#getting-started).
- The package is a member of the uv workspace. Add it to another workspace member with `uv add --workspace audit-client`.

### Environment Variables

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `HEADER_REQUEST_START_TIME` | Name of the header with the start time of the request | `X-Request-Starttime` | no |
| `HEADER_REQUEST_ID` | Name of the header with the request ID | `X-Request-Id` | no |

### Running the Module / Service

The library runs inside the Python AI modules through `packages/temporal/python`. It has no process of its own.

## Testing

From this directory:

```bash
uv run pytest
```

The tests in `tests/test_context_contract.py` check the shared examples in `fixtures/audit-context-vectors.json`. The TypeScript side checks the same file with `pnpm test` in `typescript/`.

`tests/test_audit_persistence_postgres.py` writes to a real database. It is skipped unless `AUDIT_PERSISTENCE_TEST_URL` points to a database with the backend migrations.
