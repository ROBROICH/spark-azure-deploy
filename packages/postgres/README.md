# PostgreSQL runtime

`@spark-workflow/postgres-runtime` gives every backend feature access to the shared PostgreSQL database. A feature only sees its own tables. Writes from different features can still be saved together in one transaction.

## Core Features

- The `PostgreSQL` Resource holds one set of database connections (a pool) for the whole backend. It checks the database when the backend starts and closes the connections when it stops.
- Each feature works through a query scope: a view of the database that contains only its own tables and the core tables it may join. Other tables do not exist for that feature.
- Inside `transact`, every `query` call uses the same transaction, also when the call happens inside another feature's Resource. No code has to pass the transaction along. This is how a change and its history entry are saved or rolled back together.
- `streamRows` reads large results in small batches, so the backend never holds them in memory at once.
- `providePostgresTable` offers one table to other features as a typed Resource with lookups and filters.
- `persistenceError` turns a violated database constraint into `409 CONSTRAINT_CONFLICT` and any other database error into `500 OPERATION_FAILED`.

## Architecture

### Overview

#### Query scopes

The backend provides `PostgreSQL` once with the combined tables of all features:

```ts
import { Redacted } from "effect"
import { providePostgreSQL } from "@spark-workflow/postgres-runtime"
import { combineTables } from "@spark-workflow/resource"

const postgresProvider = providePostgreSQL({
	url: Redacted.make(databaseUrl),
	schema: combineTables(dataFeatures),
})
```

Features never call this. Each feature works through a scope instead: the HTTP host hands every route a scope that contains only the feature's own tables and the core tables it may read and join. A table outside the scope does not exist for that feature.

The scope is what keeps a feature movable. Because no feature reads another feature's tables directly, the owner of a table can later serve it from another store or another service through its Resource, and nobody else has to change. See [Resource contracts](../resource/README.md#why-resources-exist).

A scope refuses a table name that the combined schema of the backend does not have. It also refuses a table definition that is a copy instead of the exact object in that schema.

#### Query and transact

Use `query` for every database operation. Use `transact` when several operations must commit or roll back together. The Comment Service writes a comment and its audit entry this way:

```ts
postgres.transact(() =>
	postgres.query(async (transaction) => {
		const created = await better(transaction, { schema: commentDatabaseSchema })
			.comments.create({ data: { id: crypto.randomUUID(), projectId, title: data.title, content: data.content, processStep: data.processStep } })
		await recordAuditEntry(transaction, {
			projectId,
			entityId: created.id,
			entityType: "comment",
			changeType: "create",
		})
		return response(created)
	}),
)
```

The `transact` callback takes no arguments. `AsyncLocalStorage` carries the transaction, so any `query` call inside it, including one inside another feature's Resource, joins the same transaction. Outside `transact`, `query` uses the pool.

Two rules keep transactions correct:

- Put every step that must be saved together into one `transact` call. A `transact` inside another one is not supported, and neither are partial rollbacks (savepoints). `pnpm lint` reports most nested calls.
- Keep the callback short. The transaction holds its database locks until the callback ends, so network calls and unrelated work belong before or after it.

The runtime stops wrong use right away:

- A `transact` inside another `transact` throws `NestedPostgresTransactionError`.
- A `transact` callback that returns while queries still run throws `UnawaitedPostgresQueryError`.
- Using a transaction after it ended throws `ExpiredPostgresTransactionContextError`.

Features never get the underlying database client directly.

Only work on this one PostgreSQL database joins a transaction. Today every Resource provider uses it, so a `transact` call covers the caller and every Resource it calls. If a provider is moved to another store or service, its work runs outside the transaction and is not rolled back when a later step fails. To make such a change all-or-nothing again, extend `transact` in `src/runtime.ts`. [Moving a Resource to another data store](../resource/README.md#moving-a-resource-to-another-data-store) explains the options.

#### Streaming and table Resources

`streamRows` reads large results in small batches. It refuses to run inside a transaction and releases its connection when the request is cancelled.

`providePostgresTable` (from `@spark-workflow/postgres-runtime/table-resource`) turns one table into a Resource, so a feature does not write plain reads and writes by hand. The examination norm breakdown cache uses it:

```ts
export const normDeconstructionsProvider = providePostgresTable({
	resource: NormDeconstructions,
	table: examinationSchema.normDeconstruction,
	identity: ["jurabk", "paragraph"],
	filterFields: ["jurabk", "paragraph"],
	schema: examinationSchema,
})
```

- `identity` names the fields that identify one row. They must match the table's primary key or a unique constraint, or the backend does not start.
- `filterFields` names the fields that queries may filter on. Filters compare values, check a list of values, check whether a field is set, and combine conditions with `and`, `or`, and `not`.
- The Resource can count, find, page through, create, upsert, update, and delete rows, one at a time or many at once. A lookup that may find nothing returns `null`. Call `.throw()` on it when a missing row is an error.
- `delete` removes the row. A table that keeps deleted rows needs its own method instead.

Use it inside the feature that owns the table, and offer other features methods named after their task. See [Getting data from another feature](../resource/README.md#getting-data-from-another-feature).

#### Migrations and connections

The backend application owns the combined Drizzle schema and its migrations. `@spark-workflow/http-host/migrations` applies them. It holds a database lock while it does, so only one process migrates the database or writes the initial data at a time.

Each process opens up to two connections by default. Count the connections of all pools and replicas against the database's limit before you raise it. For database tests that run on their own, `createPostgresRuntime` builds the same runtime without the rest of the backend.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../README.md#getting-started).

### Environment Variables

`parsePostgresPoolOptions` reads these optional settings. The application supplies the connection URL.

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `POSTGRES_POOL_MAX_CONNECTIONS` | Connections per process | `2` | no |
| `POSTGRES_POOL_IDLE_TIMEOUT_SECONDS` | Idle timeout | `30` | no |
| `POSTGRES_POOL_CONNECTION_TIMEOUT_SECONDS` | Connection timeout | `10` | no |
| `POSTGRES_POOL_MAX_LIFETIME_SECONDS` | Connection lifetime | `1800` | no |
| `POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS` | Pool close timeout | `10` | no |
| `POSTGRES_POOL_READINESS_OBSERVATION_TIMEOUT_MILLISECONDS` | How long startup waits for the readiness check | `1000` | no |

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../02-backend/apps/spark-backend/README.md#running-the-module--service).

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```

To test against a real database, set `POSTGRES_RUNTIME_TEST_URL` to a migrated test database and run `pnpm test:postgres`.
