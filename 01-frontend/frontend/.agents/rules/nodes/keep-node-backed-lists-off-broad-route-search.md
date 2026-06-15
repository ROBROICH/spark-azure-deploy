# Keep Node-Backed Lists Off Broad Route Search

- In unvirtualized node-backed rows, cards, tree items, or accordion items, do not call `route.useSearch()` without `select` inside each visible leaf.
- Read the active route ids once in the nearest list or lane owner with `route.useSearch({ select: ... })`, then pass narrow props or a focused feature context such as `selectedId`, `isSelected`, `openDetail`, or `buildSearch`.
- If that owner needs several related route fields, prefer one selective `useSearch({ select })` call that returns an object and destructure it there. Do not cargo-cult one hook per field when one grouped selective read is clearer.
- If a consumer would only receive the same route-derived ids or flags through several intermediate layers, prefer a direct local `route.useSearch({ select: ... })` read in that consumer instead of prop-drilling unchanged route state.
- Treat the combination of `route.useSearch()` plus node hooks like `useNode(...)`, `useDescendants(...)`, or `useDescendantNodes(...)` inside many siblings as a performance smell. One search-param change can invalidate the whole list even when only one row changed visually.
- If a leaf only needs to know whether it matches the selected node or needs one click handler, pass that narrow value from the owner instead of the whole search object.
- Prefer route-local `Link` search objects or owner-built callbacks over having each node leaf read broad route state for itself.

## Precedence

- Apply this rule together with `prefer-node-refs-until-payload-is-needed.md`: leaf-owned node payload reads can stay local, but broad route-search subscriptions should not also be repeated per leaf.
- This rule is about visible sibling fanout. A single detail owner or one isolated leaf can still read route search directly when there is no multiplicative sibling cost.

## Review Smell

- Every document row or norm card reads `route.useSearch()` and also resolves its own node-backed badges or counts.
- A change to `previewDocumentId`, `selectedNormId`, `lawChangeId`, or similar route state causes the whole list or grid to repaint.
- Profiling shows the same route change re-rendering many rows that did not change selection.

## Bad Example

```tsx
const search = route.useSearch();
const { data: topicNorm } = useNode(topicNormRef);
const bewertungRefs = useDescendants('bewertung', topicNormRef);

return <Row isSelected={search.topicNormId === topicNormRef.id} />;
```

## Good Example

```tsx
const { selectedTopicNormId, selectedDocumentId } = route.useSearch({
  select: (search) => ({
    selectedTopicNormId: search.topicNormId,
    selectedDocumentId: search.selectedDocumentId,
  }),
});

return topicNormRefs.map((topicNormRef) => (
  <TopicNormRow
    key={topicNormRef.id}
    topicNormRef={topicNormRef}
    isSelected={selectedTopicNormId === topicNormRef.id}
    selectedDocumentId={selectedDocumentId}
  />
));
```

The owner pays the route-search subscription once, while each row keeps only the node work it actually owns.
