# TypeScript audit client

`@spark-workflow/audit-client` records who changed what in a project. Every recorded change writes one row to `audit_log`. The protocol combines these rows with the history of the changed rows and shows each change with the person, the AI workflow, or the request behind it.

## Core Features

- An entry names the user who made the change, the user who started it, and the workflow run or request it belongs to. A workflow keeps the details of the request that started it, so the changes of an AI run stay linked to that request and its user.
- Each HTTP request and each Temporal task keeps these details separately, so requests that run at the same time never mix up their users.
- The details travel along with calls between services and into Temporal tasks.
- Entries are written in the same database transaction as the change they describe, so both are saved or rolled back together.

## Architecture

### Overview

An `audit_log` row holds `projectId`, `entityId`, `entityType`, `changeType`, `actionType`, `actorUserId`, `triggeredByUserId`, `workflowRunId`, `workflowType`, `requestStartTime`, and `requestId`. `changeType` is `create`, `update`, or `delete` for row changes, or `action` with an `actionType` for events such as an export or a CSV import.

The context lives in `AsyncLocalStorage`. The HTTP host opens it for each request with the request ID and server start time. Authentication then sets the verified actor. The Temporal integration sends the context along when a workflow starts and opens it again for each activity.

Between processes, the context travels in headers: `X-Actor-User-Id`, `X-Triggered-By-User-Id`, `X-Workflow-Run-Id`, `X-Workflow-Type`, `X-Request-Starttime`, and `X-Request-Id`. Only approved machine identities may adopt forwarded context. The client drops IDs that are not UUIDs and timestamps that are not valid.

### Components

| Export | Purpose |
| --- | --- |
| `withAuditContext` | Opens an isolated context for a request or activity |
| `setAuditActor` | Sets the verified actor |
| `adoptForwardedAuditContext` | Takes the context from incoming headers at a trusted boundary |
| `auditRequestInit` | Adds the current context as headers to an outgoing request |
| `currentAuditContext` | Returns a copy of the current context |
| `recordAuditEntry`, `recordAuditEntries` (from `/persistence`) | Write audit rows through the caller's query client |
| `/schema` | The `audit_log` table for the backend schema |

### Usage

Write the audit entry inside the same `transact` call as the change. The Comment Service does it like this:

```ts
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence"

await postgres.transact(() =>
	postgres.query(async (transaction) => {
		const created = await better(transaction, { schema: commentDatabaseSchema })
			.comments.create({ data })
		await recordAuditEntry(transaction, {
			projectId,
			entityId: created.id,
			entityType: "comment",
			changeType: "create",
		})
	}),
)
```

The client owns no pool and no transaction. `recordAuditEntry` neither commits nor retries. The actor and run fields come from the current context, so the call only names the entity and the change.

To pass the context to another service, add it to the request:

```ts
await fetch(peerUrl, auditRequestInit())
```

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../../README.md#getting-started). Audit writes need the migrated backend schema.

### Environment Variables

The client reads no environment variables. The host supplies the identity, the request context, and the database client.

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../../02-backend/apps/spark-backend/README.md#running-the-module--service).

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```
