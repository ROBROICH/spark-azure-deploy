---
ruleId: nodes/prefer-node-refs-until-payload-is-needed
---

# Prefer Node Refs Until Payload Is Needed

- Treat the graph layer as ref-first. Start from `useGraph()`, `getNodesByType(...)`, `useDescendants(...)`, or other ref-producing helpers before reaching for payloads.
- When the code immediately needs payloads for every node of one concrete type, prefer `useNodesByType('...')` over open-coding `useGraph()` plus `useNodes(getNodesByType('...'))`.
- Keep `NodeRef` values through parent and intermediate components whenever those components do not need payload fields yet.
- Prefer drilling refs instead of full payloads when the child can resolve its own data or when the payload is only needed in a leaf.
- Resolve full payloads with `useNode(...)` or `useNodes(...)` only when the code actually needs payload fields for filtering, sorting, rendering, or mutation work.
- It is acceptable for multiple lower-level leaf components to resolve the same node refs when that keeps grouping and payload-specific logic local. TanStack DB/DataLoader deduplicates and caches node payload loading, so do not report this as duplicate backend fetching unless profiling shows meaningful local subscription or derivation cost.
- Prefer late, leaf-owned node access by default when the lookup keeps the code clearer and the work stays narrow.
- When the code only needs descendant payloads and does not reuse the descendant refs for counts, other graph helpers, or additional props, prefer `useDescendantNodes(...)` over open-coding `useDescendants(...)` plus `useNodes(...)`.
- When a component only needs descendant presence or a descendant count, keep the `useDescendants(...)` refs and use `.length` instead of resolving descendant payloads or pre-crunching owner-level lookup maps.
- When the code already knows one concrete node id and needs that single payload, use `useNode(...)` instead of resolving a broader `useNodes(...)` set and searching it with `.find(...)`.
- When the input is one optional ref, use `useNode(optionalRef)` instead of `useNodes([optionalRef])`; `useNode(...)` accepts `null` or `undefined` and returns `data: null`.
- Do not eagerly resolve payloads in owner components just because a deeper component might need them later.
- Do not load broad descendant payload sets in an owner component only to derive per-leaf badges, counts, or booleans that a leaf can compute from refs.
- When many visible leaves would each run the same descendant traversal or repeated local lookup work, move that work to the nearest shared owner and pass a narrow derived structure such as a `Set`, `Map`, count, or boolean instead of repeating the computation per leaf.

## Hook Choice

- Use `useDescendants(type, ref)` when refs, counts, intersections, or further graph traversal are enough.
- Use `getChildNodes(index, refOrId, type)` when the relationship must be direct child-only. Do not use descendant helpers plus filtering when a nested child of the same type would be incorrect.
- Use `useNode(optionalRef)` for one known payload; it accepts `null`/`undefined` and returns `data: null`.
- Use `useNodes(refs)` when the current render truly requires a batch of payload fields and a scoped `Suspense` fallback is the correct loading UI.
- Use `useLiveNode(optionalRef)` or `useLiveNodes(refs)` when payloads are non-blocking enrichment or when the UI can already decide selection, grouping, and empty states from refs. Treat `data` as the currently resolved subset and `isLoading` as "the requested live subset is still settling."
- Use `useDescendantNodes(type, ref)` only when descendant payloads are the actual working set and the caller does not need the descendant refs separately.
- Use `useNodesByType(type)` only when the feature immediately needs payloads for all currently loaded nodes of one type.

## Precedence

- If the caller still needs refs, graph traversal results, or multiple graph operations, keep the ref-first flow with `useGraph()` and only materialize payloads at the point they are actually needed.
- If the same descendant refs are needed for `.length`, other graph operations, or additional props, keep `useDescendants(...)` and pass or reuse those refs instead of hiding them behind `useDescendantNodes(...)`.
- If a review finding depends on alleged repeated data loading, distinguish duplicate backend fetches from duplicate leaf subscriptions or local derivation. Prefer keeping readable leaf-owned data access unless the latter is measured or clearly expensive.
- Distinguish repeated payload reads from repeated derivation cost. Multiple `useNode(...)` calls in leaf cards can be acceptable when they keep ownership local; repeated descendant walks across large file trees, card grids, or unvirtualized lists are the stronger reason to hoist shared work upward.

## Reference

- Load [node-ref-first-examples.md](./references/node-ref-first-examples.md) only when a concrete graph-access example is needed.
