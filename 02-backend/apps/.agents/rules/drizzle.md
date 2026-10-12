---
ruleId: backend/drizzle
---

# Drizzle rules

## Read first

- `AGENTS.md`
- `direct-code.md`
- `core/no-useless-indirection.md`
- Official API: `https://better-drizzle.com/docs`

## Project shape

- Use the table delegate at the route: `db.comments.findMany(...)`, not `db.query`, a repository, or a service wrapper.
- Use `findUnique` when exactly one row is required. Use `findFirst` or its `findOne` alias for the first matching row.
- Use `findMany` for lists, `count`/`exists` for those exact questions, and `paginate` for offset or cursor pages. A simple cursor-limited read can use `findMany` with `cursor` and `take`.
- Put relation fields directly in `select` with their nested `select`, `where`, and `orderBy`; use `include` only when the complete related row belongs in the response.
- Use `create`/`createMany`, `update`/`updateMany`/`updateEach`, `delete`/`deleteMany`, and `upsert`/`upsertMany` for their matching writes. Use the operation's `select` for the response projection.
- Prefer `upsert` over a read-then-write branch and a bulk delegate over a JavaScript write loop.
- Use the Better client's `transaction` directly for atomic multi-table changes and the transaction's model delegates inside it.
- Raw SQL, including Drizzle `sql` strings, is the last resort after delegates, relations, projections, filters, pagination, and ordinary Drizzle builders cannot express the contract.
- Keep transactions at the route operation that needs atomicity.
- Do not add repository, service, database-runtime, transaction, mapping, or plugin wrappers around Better Drizzle.
- Do not replace a readable CRUD or relation query with hand-written SQL merely to remove a TypeScript transform.

## Schema changes

Edit `src/db/schema.ts`, then from the app directory:

```sh
pnpm run db:generate
pnpm run db:boundaries
```

Identity has no `db:boundaries`. Agent Orchestration and Protocol have no
Drizzle. Leave generated SQL and snapshots alone. The app applies
`migrations/` on start. The full local contract is
`02-backend/apps/AGENTS.md`.

## Verification

- After a schema change, run `pnpm vp run db:check`.
- Verify reads and mutations against the same freshly restored Python baseline.
- Capture database state before and after read profiles.
- Exercise transaction rollback against real PostgreSQL.
- Check hot-path allocations after changing projections or pagination.
