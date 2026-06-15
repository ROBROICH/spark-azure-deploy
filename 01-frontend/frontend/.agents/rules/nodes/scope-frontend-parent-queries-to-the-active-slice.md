# Scope `frontend_parent_ids` Queries To The Active Slice

- When a feature derives selection, grouping, or assignment state from `frontend_parent_ids`, scope the live query to the current topic, open group, visible file set, or active dialog slice instead of the whole project corpus.
- Assume that updates to `frontend_parent_ids` can invalidate every derived relationship model built from that query. Design the query boundary so one relation change does not force project-wide recomputation.
- Do not load all `norm`, `topic_norm`, `gesetz`, or `dokument` payloads just to answer the current panel's active selection. Prefer active ids, visible ids, or lazily expanded group ids as the query boundary.
- If a feature needs repeated lookups from the same active slice, build one narrow `Map`, `Set`, or grouped structure in the owner and pass that down instead of rescanning the wide payload set in many children.
- Keep the leaves payload-backed and raw. The optimization target here is query scope and shared derivation, not inventing large cached view-model layers.

## Precedence

- Apply this rule together with `model-edges-from-child-frontend-parent-ids.md`: still derive the relation from the persisted edge owner, but keep the read model scoped to the active feature slice.
- If the UI truly needs a project-wide corpus view, document that explicitly and avoid also recomputing the same grouping inside child rows or cards.

## Review Smell

- Opening one dialog or lane loads every `norm` or `topic_norm` payload in the project and then scans all `frontend_parent_ids`.
- Toggling one relation causes the full grouped selection model to rebuild.
- The feature only shows one topic or one visible file subset, but its live query reads all nodes of the relevant type.

## Bad Example

```tsx
const { data: normen } = useNodesByType('norm');

const selectedNorms = normen.filter((norm) =>
  norm.frontend_parent_ids.some((parentId) => parentId === activeTopicNormKey),
);
```

## Good Example

```tsx
const { data: topicNorms } = useDescendantNodes('topic_norm', activeTopicRef);
const visibleTopicNormIds = new Set(topicNorms.map((topicNorm) => topicNorm.id));

const selectedNorms = normen.filter((norm) =>
  norm.frontend_parent_ids.some((parentId) => {
    const parentRef = fromCompositeKey(parentId as CompositeKey);
    return (
      parentRef.node_type === 'topic_norm' &&
      visibleTopicNormIds.has(parentRef.id)
    );
  }),
);
```

The relation still comes from `frontend_parent_ids`, but the expensive part is constrained to the active topic slice.
