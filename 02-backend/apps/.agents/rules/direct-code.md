---
ruleId: backend/direct-code
---

# Backend direct-code rules

Use this before touching backend code. The goal is code that a reader can follow from the route or caller without jumping through fake layers.

## Core Rules

- Prefer direct code at the use site. If a route performs a database operation once, put the Drizzle operation in that route handler.
- Do not create a function unless it earns the jump. One caller means inline by default.
- Do not create same-file helper functions to make a route look shorter. Moving code 80 lines down is still indirection.
- Do not keep service, repository, store, adapter, or factory layers that only rename concrete behavior.
- Static runtime capabilities should be imported from their owner: `env`, `db`, auth, and similar modules.
- Do not store backend product/runtime data in process memory. This app must be safe for serverless, multi-process, restarts, concurrency, and horizontal scale.
- Tests must not define production architecture. Avoid fake in-memory stores just so tests can inject state.
- Remove compatibility paths during replacement unless the user explicitly asks for a staged migration.
- Do not add generic property access helpers such as `stringValue`, `textValue`, `numberValue`, `asRecord`, or equivalent wrappers. Type the external boundary once, then access the real typed fields directly.

## Server State Rule

Backend state must live in a durable source of truth: Postgres/Drizzle tables, an explicit external system, or a real infrastructure boundary. Process-local state is not a source of truth.

Never add or keep module-level mutable state for server data:

- `new Map()`, `new Set()`, arrays, objects, caches, counters, queues, latest-value holders, idempotency maps, session maps, telemetry maps, recommendation maps, or in-memory event stores.
- Fake repositories, or test stores that production code can use.
- A write endpoint that populates process memory and a read endpoint that later reads it.

Allowed uses are narrow:

- Immutable constants and lookup tables that are never mutated after module load.
- Temporary collections scoped inside one request/function for local computation only.
- Connection pools or clients that do not own product data.

If a route reads data, the route should show the durable read: usually a Drizzle query in the handler, unless the behavior is a real external boundary. If a route writes data later read by another route, both routes must point to the same durable table/system. The reader must not need to search references to discover which other endpoint populated an in-memory variable.

When no durable source exists yet, do not paper over it with a `Map`. Either add the real table/infrastructure in the same change, remove the endpoint until the source exists, or return an honest unimplemented/error path if the product contract requires the route to exist during a rebuild.

## Function Bar

A function is allowed when it has a real reason:

- It is reused by multiple call sites and the shared body is not just a tiny condition or renamed call.
- It isolates genuinely complex logic that would distract from the caller.
- It is required by a callback API, recursion, streaming iterator, or external protocol shape.
- It owns a real external boundary, such as a Temporal client, object storage, or an identity provider.
- It centralizes policy that must stay consistent across call sites.

If none of these apply, inline it.

## Suspicious Patterns

Remove or avoid these unless there is a concrete product reason:

- `createX(options)` that exists only to pass dependencies into another `createY(options)`.
- Interfaces with one real production implementation.
- Tests that duplicate database behavior.
- Module-level `Map`, `Set`, array, or object state.
- Functions named like `getLatestThing`, `recordThing`, `enqueueThing`, or `listThing` that hide process-local state instead of a durable query or external system.
- Route calls like `service.getThing(id)` where the reader must jump through an interface to find the query.
- One-line helpers such as `isFoo(value)`, `toDto(row)`, `getThing(id)`, or `buildPayload(input)` when used once.
- Wrapper functions that only call another wrapper.
- Generic "services" plugins that decorate a broad dependency bag.

## Preferred Backend Shape

- Route files are URL-shaped and grouped enough to read the route surface without opening many files.
- Route handlers show the concrete operation they perform.
- Drizzle query bodies live where their behavior is read, unless genuinely reused.
- Cross-route data flow goes through a durable table or explicit external system, not process memory.
- Cross-cutting Elysia behavior lives in complete plugin modules that own their wiring.
- `setup.ts` composes complete plugins; it does not manufacture or forward dependency bags.
- `env.ts` owns parsed static config.
- `db/client.ts` owns the database client.

## Review Checklist

Before finishing backend work, search for the smell you touched:

- Confirm any remaining function, interface, adapter, or factory has a real reason under "Function Bar".
- Confirm any remaining process-local mutable state is request-local, immutable lookup data, or a non-data client/pool.
- State any indirection intentionally left behind and why it still exists.
