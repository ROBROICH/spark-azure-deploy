---
ruleId: nodes/keep-node-summary-refresh-centralized
---

# Keep Node Summary Refresh Centralized

- Keep background graph-summary freshness in `src/db/nodes/collections/nodeSummariesFreshness.ts`; do not add feature-level polling hooks for node summaries.
- Summary refreshes must refetch summary refs only. Payload collections stay scoped and on-demand so background freshness does not overwrite active node-editing UI.
- Start summary polling only while the node summaries collection has active subscribers. Do not keep inactive project/version collections polling in the background.
- Preserve the browser lifecycle behavior: poll every five minutes while visible, refetch on focus or visible-again, dedupe rapid focus events, and pause while `document.visibilityState === 'hidden'`.
- Workflow-driven summary refreshes should call the loader-provided `refetchNodeSummaries` path after observed workflow completion instead of reloading the whole tree or remounting feature screens.
- Feature-owned writes that need backend-derived summary fields, such as computed `parents`, should track `tx.isPersisted.promise` with `useNodeSummaryRefetchOnTrackedPersistence()` mounted at the route or feature owner that should trigger the eventual refetch.
- Do not mount persistence-triggered summary refetch ownership in leaf panels, detail views, or controls that remount during normal in-feature navigation.
- Do not refetch node summaries after every local classification change or optimistically patch backend-derived summary-only relationship fields just to make another feature's graph view fresh.

## Bad Example

```tsx
useEffect(() => {
  const intervalId = window.setInterval(() => {
    refetchSubtree('risikohinweise');
  }, 5 * 60 * 1000);

  return () => window.clearInterval(intervalId);
}, [refetchSubtree]);

const tx = transact(() => {
  update(argument, (draft) => {
    draft.topic_id = topicId;
  });
});

void refetchNodeSummaries();
```

## Good Example

```ts
const collection = createCollection(options);

installNodeSummariesBackgroundRefresh(collection);

return collection;
```

```tsx
const { trackPersistenceForNodeSummaryRefetch } =
  useNodeSummaryRefetchOnTrackedPersistence();

const tx = transact(() => {
  update(argument, (draft) => {
    draft.topic_id = topicId;
  });
});

trackPersistenceForNodeSummaryRefetch(tx.isPersisted.promise);
```
