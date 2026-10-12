# Dienst Protokollverwaltung (Protocol Management Service)

Shows the complete change history of a project across all features. For every change it shows who made it and when, and whether a person or an AI workflow made it.

## Core Features

- The protocol, as the change history is called in the product, combines changes from project data, the formal completeness check, comments, supplementary requests, the plausibility check, documents, the decision draft, the legal review, and objections.
- Each change names the user who made it, the user who started it, and the workflow run or the request it belongs to.
- By default, all changes from one workflow run or one request appear as one group. An AI run that changed hundreds of rows is a single entry.
- You can download the history of a project as `history.json`.

## Architecture

### Overview

The protocol owns no tables. It reads the history that the other features already keep:

- Versioned tables store in `sys_period` the time span in which each row is valid, and they keep the earlier states of each row in a `<table>_history` table. The protocol turns these time spans into create, update, and delete events, with the old and the new row.
- `audit_log` adds who made the change, who started it, the workflow run and type, the action, and the request ID.

[`src/sources.ts`](src/sources.ts) lists the tables of each source. To show a new table in the protocol, add it there. The table needs a project column and a matching `_history` table.

Filters (date range, source, service, workflow run ID, request ID) apply before grouping. In the grouped view, changes are grouped by workflow run or by request, and a change without either stays on its own. Each group shows its earliest change. `total` then counts groups. With `ungrouped=true`, `total` counts single changes.

Reading needs the project `audit` permission, which project auditors have. The `admin` and `service` roles bypass that check.

### Dependencies

The protocol is not declared like the other features and has no Resources. The backend gives it read access to the shared database and adds its routes directly.

### API Endpoints

The backend serves these routes under `/api/protocol/v1`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/projects/:projectId/history` | Returns one page of history, 1 to 500 entries |
| `GET` | `/projects/:projectId/history/export` | Downloads the filtered history as `history.json`, up to 10,000 entries |

Above 10,000 entries the export fails with `EXPORT_LIMIT_EXCEEDED`. Narrow the filters and export again.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the local stack through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

The package reads no variables of its own. The backend supplies the database and authentication settings described in the [backend environment](../../apps/spark-backend/README.md#environment-variables).

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```
