---
ruleId: nodes/derive-relationships-from-persisted-node-edges
---

# Derive Relationships from Persisted Node Edges

- Treat node relationships as data owned by persisted edge fields such as `frontend_parent_ids`, `parents`, `dokument_id`, and `chunk_id`.
- Derive joins from the payload that actually stores the relation before inventing fallback joins by title, label, filename, or route-local assumptions.
- When graph summary refs and payloads disagree, trust the persisted payload relationship and narrow the UI to payload-backed results.
- If the UI needs a joined value that is not stored on the visible node, resolve the related node through the persisted key. Example: a `fundstelle` click needs `chunk.page_numbers`, so follow `fundstelle.chunk_id` to the `chunk` payload instead of inventing a page field on `fundstelle`.
- For mutation rules when the same relationship is persisted in multiple places, follow [Run Node Mutations Via `useAction`](./run-node-mutations-via-useaction.md).

## Why

- The nodes graph is not a separate source of truth from payload relations.
- Field-name or display-name joins drift quickly and hide the actual persistence model.
- Following the stored edge owner keeps read logic and write logic aligned.

## Bad Example

```tsx
const matchingNorm = normen.find((norm) => norm.jurabk === topicNorm.jurabk);
```

## Good Example

```tsx
const matchingNorm =
  norm.frontend_parent_ids
    .map((parentId) => fromCompositeKey(parentId as CompositeKey))
    .find((parentRef) => parentRef.node_type === 'topic_norm') ?? null;
```

Use the persisted edge keys first, then resolve the related payload from those keys.
