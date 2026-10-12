---
ruleId: nodes/keep-optional-node-metadata-non-suspending
---

# Keep Optional Node Metadata Non-Suspending

- In code review, flag suspending `useNode(...)` or `useNodes(...)` calls when the payload is only used for optional labels, badges, external-state decoration, icons, tooltips, or click-target metadata.
- Do not let optional node metadata sit behind a page, lane, tab, or panel-level `Suspense` boundary if the main result or empty state can already be rendered from graph refs, indexes, route state, or previously resolved data.
- Prefer `useLiveNode(...)` or `useLiveNodes(...)` for optional metadata in already-visible node-driven UI. Render a stable fallback label or omit the decoration until that metadata resolves.
- For live hooks, render from `data` when it is available even if `isLoading` is still true. `isLoading` means the current on-demand subset is still settling; it must not hide already-resolved rows or labels.
- Keep `useNode(...)` and `useNodes(...)` for required payloads that the component genuinely cannot render without. In that case, the Suspense fallback should represent the primary content that is loading, not optional enrichment.
- If several cards each own required payload reads, put a small `Suspense` boundary around the card or row rather than one shared lane boundary that can blank all siblings.
- Add a regression test for selection changes, empty result sets, or stale refs when changing a suspending lookup to a live lookup.

## Review Smell

- A component already has `fundstellenCards`, `nodeRefs`, counts, or an empty-state decision available, then calls `useNodes(...)` only to resolve display names for those rows.
- A route-backed selection change can make the whole lane show a skeleton even after network and graph preload have finished.
- DevTools shows React hiding old content with `display: none` while a broad Suspense fallback remains visible.

## Bad Example

```tsx
const cards = getCardsForSelectedNorm(selectedNormId);
const documentRefs = cards.map((card) => ({
  id: card.documentId,
  node_type: 'dokument' as const,
}));
const { data: documents } = useNodes(documentRefs);

if (cards.length === 0) {
  return <EmptyState />;
}

return <Cards cards={cards} documents={documents} />;
```

Here, `cards` already decides whether the UI has results. Suspending only to hydrate document labels can keep the whole lane in a skeleton instead of rendering cards or the empty state.

## Good Example

```tsx
const cards = getCardsForSelectedNorm(selectedNormId);
const documentRefs = cards.map((card) => ({
  id: card.documentId,
  node_type: 'dokument' as const,
}));
const { data: documents } = useLiveNodes(documentRefs);

if (cards.length === 0) {
  return <EmptyState />;
}

return <Cards cards={cards} documents={documents} />;
```

The cards and empty state render immediately from the resolved selection/index. Document names, file ids, and external metadata can fill in when the live query resolves.

## Example Regression

For the MVP Fundstellen lane, selecting a norm whose fundstellen set is empty must render "no results" instead of the `FundstellenTabContentSkeleton`. Selecting a norm with existing fundstellen must render cards even if document metadata is still resolving.
