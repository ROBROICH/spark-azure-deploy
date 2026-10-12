# Backend Code Standards

Use this index after inspecting the selected backend app, requested files, and relevant tests.
Read the baseline rules, then only conditional rules supported by visible code evidence.

## Baseline

Read these rules for every direct backend plan, edit, or review:

- [core/engineering.md](./rules/core/engineering.md)
- [direct-code.md](./rules/direct-code.md)

## Conditional rules

- Tests that inventory routes, operation IDs, dependencies, or other implementation shape: [core/no-change-detector-test.md](./rules/core/no-change-detector-test.md).
- A proposed wrapper, adapter, service, repository, factory, or alias: [core/no-useless-indirection.md](./rules/core/no-useless-indirection.md).
- Nullable values entering APIs, databases, filesystems, commands, caches, or jobs: [core/no-sentinel-boundary-inputs.md](./rules/core/no-sentinel-boundary-inputs.md).
- No-op queries, skipped jobs, placeholder streams, or synthetic operation objects: [core/no-synthetic-idle-operations.md](./rules/core/no-synthetic-idle-operations.md).
- Custom infrastructure that duplicates standard library or established package behavior: [core/no-bespoke-table-stakes.md](./rules/core/no-bespoke-table-stakes.md).
- Elysia routes, plugins, authentication, TypeBox, setup, or controller composition: [elysia.md](./rules/elysia.md).
- PostgreSQL, Drizzle, schema, migration, query, or transaction work: [drizzle.md](./rules/drizzle.md).
- `Result`, EvlogError, catalogs, recoverable failures, or HTTP error mapping: [error-handling.md](./rules/error-handling.md).

The Elysia rule links its own focused references. Read only the referenced controller, plugin, auth, or Drizzle-to-TypeBox material needed by the task.

## Repository rules

App README, package metadata and code beside the change win over a rule here only when they state an
explicit conflict.
