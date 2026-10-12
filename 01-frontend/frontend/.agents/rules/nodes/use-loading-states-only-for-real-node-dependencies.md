---
ruleId: nodes/use-loading-states-only-for-real-node-dependencies
---

# Use Loading States Only for Real Node Dependencies

- Model loading state from the actual node hook contract instead of inventing defensive UI around data that is already guaranteed by the graph layer.
- `useNode(...)` returns `data: ... | null`; handle that nullability where the payload is genuinely optional or still loading.
- `useNodes(...)` already normalizes `data` to `[]`; use that returned array directly instead of layering extra manual fallback types on top.
- Add loading skeletons only when a component truly depends on payloads that may still be resolving.
- Prefer an early return for loading states in the owner component when the rest of the render depends on that payload data.
- When many visible node-driven leaves suspend independently, give each leaf or small sibling group its own `Suspense` boundary instead of one large owner boundary that retries the whole list serially.
- If one owner can batch the visible refs up front with `useNodes(...)`, prefer that over per-leaf suspense churn; use leaf-level `Suspense` when keeping ownership local is clearer or safer.
- Do not add skeletons for graph-summary data that is already guaranteed to exist in the current feature flow.

## Precedence

- Apply this rule together with `prefer-node-refs-until-payload-is-needed.md`: leaf-owned payload reads are still acceptable, but do not let one shared `Suspense` boundary turn those reads into a render-time waterfall.
- If the choice is between hoisting a clear `useNodes(...)` batch and adding many tiny boundaries, prefer the batched owner read. Reach for per-leaf `Suspense` when the main goal is to stop sibling rows or cards from blocking each other.

## Why

- It keeps loading logic aligned with the actual API.
- It reduces fake complexity and unnecessary branches.
- It avoids UI states that can never happen in practice for preloaded graph refs.
- It prevents node-hook retries from serializing a whole list behind the first unresolved child.

## Good Example

```tsx
const { data: fundstellen, isLoading } = useNodes(fundstellenRefs);

if (isLoading) {
  return <FundstellenSkeletonList count={4} />;
}

return <FundstellenList fundstellen={fundstellen} />;
```

## Also Good

```tsx
const { data: topics } = useNodes(topicRefs);
const sortedTopics = sortTopics(topics);
```

`useNodes(...)` already returns `[]` when nothing is loaded yet, so avoid extra hand-written fallback types.

## Also Good

```tsx
{satzRefs.map((satzRef) => (
  <Suspense key={satzRef.id} fallback={<AiSatzRowSkeleton />}>
    <AiSatzRow satzRef={satzRef} />
  </Suspense>
))}
```

Use per-row or per-card boundaries when each leaf owns its own node reads and one unresolved child would otherwise block all visible siblings.
