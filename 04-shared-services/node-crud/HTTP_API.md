# HTTP API — node-crud services

Every service built on `node-crud` exposes the same three endpoints, scoped under a `project_id`. This is the reference for consumers of those endpoints. Code samples use terminology from the examination service (`gesetz`, `norm`, `satz`, …) to keep examples concrete, but the shape is identical everywhere.

## Base URL

All endpoints are scoped under `/{project_id}/`, where `project_id` is a UUID. Every read is filtered to rows owned by that project; every write is validated against it.

## Endpoints

### `GET /{project_id}/nodes` — list (lightweight)

Returns every node in the project with just `id`, `node_type`, `parents`, and `frontend_parent_ids`. No payload data — use this to build the tree/graph UI.

```typescript
// Response
{
  nodes: Array<{
    id: string;         // UUID
    node_type: string;  // one of the service's registered node types
    parents: Array<{
      id: string;
      node_type: string;
    }>;
    frontend_parent_ids: string[]; // see "frontend_parent_ids" below
  }>;
}
```

Parents are derived from FK columns on the server, so the list always reflects the current graph. Root nodes (no FKs to other node tables) have `parents: []`.

> The response is streamed straight from Postgres, so it's cheap to call even for large projects. Use it as the source of truth for "what's there"; pair it with batch-nodes when you actually need payloads.

### `POST /{project_id}/batch-nodes` — fetch full payloads

Request the full data for one or more nodes. Typical use: the user clicks a node in the tree and you load its details.

```typescript
// Request
{
  nodes: Array<{ node_type: string; id: string }>
}

// Response
{
  results: Array<
    // Discriminated union keyed on `node_type`
    | { node_type: "gesetz", id: string, project_id: string, name: string, jurabk: string, ... }
    | { node_type: "norm",   id: string, project_id: string, gesetz_id: string, text: string, ... }
    | { node_type: "satz",   id: string, project_id: string, absatz_id: string, text: string, ... }
    // ... one variant per node type the service registers
  >
}
```

The `node_type` field is a **discriminator** — branch on it to get the right fields:

```typescript
for (const node of response.results) {
  switch (node.node_type) {
    case "gesetz":
      console.log(node.name, node.jurabk);
      break;
    case "norm":
      console.log(node.text);
      break;
  }
}
```

**Tip:** feed the service's `openapi.json` into a codegen tool so the union stays in sync automatically:

```bash
npx openapi-typescript openapi.json -o src/api/schema.d.ts
```

### `POST /{project_id}/update` — batched mutations

Insert, patch, and delete in a **single database transaction**. If any part fails, nothing is committed.

```typescript
// Request
{
  inserts: Array<
    | { node_type: "gesetz", id?: string, payload: { name: string, jurabk: string } }
    | { node_type: "norm",   id?: string, payload: { gesetz_id: string, text: string, ... } }
    // ... one variant per node type
  >,
  updates: Array<
    // Same discriminator, `id` required, every payload field optional (PATCH semantics)
    | { node_type: "gesetz", id: string, payload: { name?: string, jurabk?: string } }
    | { node_type: "norm",   id: string, payload: { text?: string, ... } }
    // ...
  >,
  deletes: Array<{ node_type: string; id: string }>
}

// Response
{
  inserted: Array<FullNodeResponse>,  // same shape as batch-nodes results
  updated:  Array<FullNodeResponse>,  // full fields after update
  deleted:  Array<{ node_type: string; id: string }>
}
```

Rules:

- **`inserts`** — `id` is optional. Omit it and the server generates a UUID; provide one (e.g. for optimistic UI) and the server will use it.
- **`updates`** — only send fields you want to change. Omitted fields stay untouched. Sending `null` explicitly writes `NULL` to the DB.
- **`deletes`** — same `{node_type, id}` shape as `NodeRef`, so you can feed a ref straight from the list or batch-get response.
- **No aliasing within a request** — targeting the same `(node_type, id)` in more than one of `inserts`/`updates`/`deletes` is rejected with a 422.
- **Ordering preserved** — `inserted`, `updated`, and `deleted` arrays return items in the same order as you sent them.
- **Soft delete** — `deletes` flip `is_deleted=true`; rows remain in the DB (useful for history tables) but are hidden from every subsequent read.

## `frontend_parent_ids`

Every node carries a `frontend_parent_ids: string[]` column alongside its FK-derived `parents`. Think of it as a deliberate escape hatch.

We don't yet know every relation that should exist between node types, and in some areas the interface hasn't been finalized enough to express the relation as a real foreign key. Rather than block product work behind a perfect schema, the frontend can stash the parent ids it's already using into this array. Nothing about those ids is enforced on the server — no FK, no type, no existence check.

The payoff is observational: once a feature has been live for a while, we can introspect what actually shows up in `frontend_parent_ids` across projects. Patterns emerge — like gravity — and the pairs of node types that keep appearing together are the ones that belong as proper FKs. At that point we promote the most important relations into real columns (often with `__external_parent_cols__` for cross-service refs, or a first-class FK for in-service ones) and tighten the constraints.

Practical rules:

- Treat `frontend_parent_ids` as append-only from the UI's perspective — set it when you create/update the node; the server won't do anything clever with it.
- Don't rely on referential integrity. Ids may point at nodes in other services, at deleted nodes, or at nothing at all.
- `parents` (FK-derived) is still the source of truth for structural relations. `frontend_parent_ids` is only what the UI added on top.

## Node types & payload shapes

Every service exposes its own set of node types — grab them from the service's `openapi.json`:

- `NodeRef.node_type` is a `Literal` enum of every registered type.
- Each `{Type}InsertPayload` / `{Type}PatchPayload` is listed as its own schema.
- `NodeResponseUnion` / `InsertNodeActionUnion` / `PatchNodeActionUnion` give you the discriminated unions.

For example, the examination service registers types like `gesetz`, `norm`, `absatz`, `satz`, …, with a hierarchy roughly `gesetz → norm → absatz → satz → ...`. Other services register their own.

## Validation

Payloads are validated per node type with `extra="forbid"`. Sending a field the type doesn't know about — e.g. `{ node_type: "gesetz", payload: { text: "foo" } }` when `gesetz` has `name` / `jurabk` — fails with a 422. Check `openapi.json` for the exact fields.

## Errors

| Status | When                                                                 |
| ------ | -------------------------------------------------------------------- |
| 404    | A referenced `{node_type, id}` doesn't exist (or is soft-deleted)    |
| 422    | Unknown `node_type`, invalid parent type, malformed payload, request validation |
| 500    | Anything else — check the service logs                               |

The body is always `{"detail": "..."}`.
