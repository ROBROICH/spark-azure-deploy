# TypeScript backend APIs

Before direct planning, edits or review, read
[.agents/CODE-STANDARDS.md](.agents/CODE-STANDARDS.md), its baseline rules and only
the conditional rules supported by the selected code.

After backend code edits, run from the repository root for each app:

```sh
pnpm vp lint 02-backend/apps/<app>
pnpm vp run --filter './02-backend/apps/<app>' typecheck
```

pnpm is the script runner. Bun is the runtime those scripts start.

```sh
cd 02-backend/apps/<app>
pnpm run <script>
```

From the repository root the same scripts are
`pnpm --filter @spark-workflow/<package> run <script>`.

## Schema changes

Agent Orchestration and Protocol have no Drizzle. Identity has `db:generate`
only. The other apps keep schema in `src/db/schema.ts` and generated SQL in
`migrations/`.

Edit `src/db/schema.ts`. Do not hand-author a migration for a change the schema
file describes.

```sh
pnpm run db:generate
```

drizzle-kit diffs the schema against the latest `migrations/meta` snapshot.
If nothing changed, it prints `No schema changes, nothing to migrate` and
writes nothing.

For apps that define `db:boundaries`:

```sh
pnpm run db:boundaries
```

Do not edit the generated `*_database_boundaries` file. Later boundary
migrations contain only the delta from the previous one. `pnpm vp run db:check`
compares the most recent `*_database_boundaries` migration with the history
tables, `updated_at` triggers, and deferrable foreign keys of the latest
snapshot. Run `db:boundaries` after `db:generate` whenever a schema change
alters one of them.

Commit the schema, the new SQL, `migrations/meta/*_snapshot.json`, and
`_journal.json`. The next `pnpm start` applies `migrations/` through
`migrateDatabase()` before `/ready`.

## Tests

```sh
pnpm test
```

The script is `bun test --isolate`. HTTP and database integration tests stay skipped
until that app's documented `*_DATABASE_URL` / `*_BASE_URL` variables are set.
An empty skip set is not a pass of those integration tests; the unit and contract files
that ran are.
