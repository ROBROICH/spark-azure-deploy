# Avoid Keyed Remounts For Node Detail Lanes

- Do not key a whole node-driven lane, tab, or panel `Suspense` boundary on route-backed selection ids when only one detail subtree actually changes.
- Keep the surrounding shell, list, and previously resolved sibling content mounted. Swap only the selected detail owner when the user drills into a different node.
- If selecting a node mounts a heavy detail subtree with many `useNode(...)`, `useNodes(...)`, or `useDescendantNodes(...)` calls, prefer deferring the selected id with `useDeferredValue(...)` so click or focus feedback can paint before the heavy detail consumer catches up.
- Use `startTransition(...)` for the route write when helpful, but do not assume it solves the problem by itself. If the selection change remounts the entire query subtree, the expensive work still happens.
- Only force a keyed remount when the previous detail state is truly invalid or dangerous to preserve.

## Precedence

- Apply this rule together with `keep-optional-node-metadata-non-suspending.md`: optional metadata should not blank a lane, and required heavy detail consumers should not remount a whole lane unnecessarily.
- This rule is about selected-node detail panes. It does not forbid small keyed leaf resets where the remount cost is intentionally tiny.

## Review Smell

- A route selection changes one sentence, norm, or document, but the entire lane falls back to a skeleton.
- The lane `Suspense` key includes several search params such as `topicId`, `topicNormId`, `satzId`, `previewDocumentId`, or `showNormtext`.
- Profiling shows a route change remounting all detail queries instead of updating only the selected pane.

## Bad Example

```tsx
const search = route.useSearch();
const detailKey = `${search.topicNormId}:${search.satzId}:${search.showNormtext}`;

return (
  <Suspense key={detailKey} fallback={<PanelSkeleton />}>
    <HeavyDetailPanel />
  </Suspense>
);
```

## Good Example

```tsx
const selectedSatzId = route.useSearch({
  select: (search) => search.satzId,
});
const deferredSatzId = useDeferredValue(selectedSatzId);

return (
  <PanelShell>
    <SentenceList />
    <HeavyDetailPanel satzId={deferredSatzId} />
  </PanelShell>
);
```

The route state stays canonical, but the heavy node-detail consumer does not remount the whole lane on every selection change.
