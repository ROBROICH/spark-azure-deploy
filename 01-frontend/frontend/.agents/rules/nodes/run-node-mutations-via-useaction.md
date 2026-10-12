---
ruleId: nodes/run-node-mutations-via-useaction
---

# Run Node Mutations Via `useAction`

- For node payload updates in feature UI, use `const { transact, update } = useAction()` and perform writes inside `transact(() => { update(node, ...) })`.
- Pass the real node payload returned by `useNode(...)` or `useNodes(...)` into `update(...)`; do not hand-build partial node objects or `{ id }` stubs just to mutate one field. `useAction` writes target payloads by `compositeKey`, not raw `id`.
- Batch related node changes in one `transact(...)` call so the optimistic update and backend write stay aligned.
- When one relationship is stored across multiple payloads, mutate every persisted edge owner inside the same `transact(...)`. For `topic`, `topic_norm`, and `norm`, adding a norm means inserting the `topic_norm` node and appending its composite key to `norm.frontend_parent_ids`; removing it means deleting the `topic_norm` node and removing that key from the `norm`.
- If a new backend field exists in practice but is not yet present in generated types, keep any cast narrow and local to that field assignment until the generated type catches up.

## Bad Example

```tsx
const toggleChecked = (topicNormId: string) => {
  setCheckedIds((prev) => {
    const next = new Set(prev);
    if (next.has(topicNormId)) {
      next.delete(topicNormId);
      return next;
    }
    next.add(topicNormId);
    return next;
  });
};
```

## Good Example

```tsx
const { transact, update } = useAction();

const toggleChecked = (topicNorm: NodePayloadByType<'topic_norm'>) => {
  transact(() => {
    update(topicNorm, (draft) => {
      (
        draft as typeof draft & {
          mvpChecked?: boolean | null;
        }
      ).mvpChecked = !draft.mvpChecked;
    });
  });
};
```
