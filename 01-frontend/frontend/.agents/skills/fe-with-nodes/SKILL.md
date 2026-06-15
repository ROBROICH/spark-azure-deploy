---
name: fe-with-nodes
description: Wire node-backed backend data into frontend features in this repo. Use when a developer asks to work "with nodes", mentions "nodes", "wire up", or "backend", or wants to replace mocks/manual view models with real node hooks in MVP, RPB, or related frontend code under 01-frontend/frontend.
---

# FE With Nodes

Use this skill when connecting frontend UI to the shared nodes layer in `01-frontend/frontend`.
Follow the existing nodes rules and feature patterns before inventing new data flow.

## Read First

Start by reading the relevant rules in `01-frontend/frontend/.agents/rules/nodes/`.
Do not restate them from memory. Use this load map:

- Core reads and typing:
  - `prefer-node-refs-until-payload-is-needed.md`
  - `derive-node-types-from-hooks-and-nodepayloadbytype.md`
  - `keep-leaf-node-payloads-raw.md`
- Relationships and graph summaries:
  - `derive-relationships-from-persisted-node-edges.md`
  - `model-edges-from-child-frontend-parent-ids.md`
  - `scope-frontend-parent-queries-to-the-active-slice.md`
  - `treat-graph-summary-refs-as-hints-until-payloads-confirm-them.md`
- Loading, live data, and selection performance:
  - `keep-optional-node-metadata-non-suspending.md`
  - `use-loading-states-only-for-real-node-dependencies.md`
  - `keep-node-backed-lists-off-broad-route-search.md`
  - `avoid-keyed-remounts-for-node-detail-lanes.md`
- Mutations and freshness:
  - `run-node-mutations-via-useaction.md`
  - `use-generated-insert-payloads-for-node-inserts.md`
  - `keep-node-summary-refresh-centralized.md`
- Migration and subsystem boundaries:
  - `remove-mocks-after-node-migration.md`
  - `flag-db-nodes-changes-in-review.md`

If the change touches `src/db/nodes/**`, treat that as a boundary crossing and justify it explicitly.

## Workflow

1. Identify the smallest useful graph entry point.
2. Keep `NodeRef`s as long as possible.
3. Resolve payloads only where payload fields are truly needed.
4. Use suspending vs live hooks intentionally.
5. Mutate through `useAction`, not feature-local optimistic state.
6. Keep node-backed lists and detail lanes stable across route selection changes.
7. Add focused tests around loading, empty, selection, and mutation behavior.

## Reading

### Ref-first

Default to graph refs first:

- `useGraph()` when you need graph traversal helpers or type buckets.
- `useDescendants(type, startRef)` when you need descendant refs, counts, or presence.
- `useNodesByType(type)` when you immediately need payloads for all currently loaded nodes of one type.

Keep refs through intermediate components. Resolve payloads in the leaf or nearest owner that actually uses the fields.

When rendering actual node leaves such as `topic`, `dokument`, `topic_norm`, `satz`, or `fundstelle`, pass the raw payload object to the leaf once payload fields are needed. Avoid decomposing node payloads into temporary scalar props or mirror view models unless the UI is building a real synthetic container.

### `useNode` vs `useNodes`

Use `useNode(ref)` when:

- you already know one concrete node id
- the input is optional
- the component cannot render its main content without that one payload

Use `useNodes(refs)` when:

- the component truly needs a batch of payloads to render primary content
- batching the visible refs in one owner is clearer than many leaf lookups
- suspending for those payloads is acceptable

`useNode` and `useNodes` are the suspending hooks.

### `useLiveNode` / `useLiveNodes`

Use the live hooks for non-blocking enrichment:

- labels
- badges
- tooltip metadata
- secondary document/norm names
- already-visible cards that should stay rendered while metadata refreshes

Reach for `useLiveNodes` over `useNodes` when the UI can already decide empty state, grouping, or selection from refs or previously resolved data, and the fetched payloads are only decoration.

Good local pattern: MVP fundstellen keeps the lane stable with `useDescendants(...)` plus `useLiveNodes(...)` in:

- `src/features/project/mvp/topic-detail-screen/screen-content/MvpFundstellenContext.tsx`
- `src/features/project/mvp/topic-detail-screen/screen-content/FundstellenContent.tsx`

### `useDescendantNodes`

Use `useDescendantNodes(type, startRef)` when:

- you only need descendant payloads
- you do not need to reuse the descendant refs separately
- the descendant payloads are the actual working set

If you need counts, presence, or reuse of refs for other joins, stay with `useDescendants(...)` and resolve payloads later.

### Typing

Infer from hooks by default.
Use `NodePayloadByType<'...'>` only for explicit props, helpers, or callbacks that truly need a stable payload type.
Do not create mirror types for node payloads once a feature is nodes-backed.

### Relationships

Derive joins from persisted relationships:

- `frontend_parent_ids`
- `parents`
- direct foreign-key fields like `norm_id`, `gesetz_id`, `chunk_id`, `dokument_id`

Do not join by label, title, filename, or ad hoc semantic matching when a persisted edge already exists.

For `frontend_parent_ids`, model the direction from the child payload:

- `topic -> topic_norm` comes from `topic_norm.frontend_parent_ids`.
- `topic_norm -> norm` comes from `norm.frontend_parent_ids` containing `topic_norm:<id>`.
- A `norm` belongs to a `topic` only when a matching `topic_norm` child belongs to that topic.

Scope relationship queries to the active topic, visible group, open dialog, or current file set. Do not load the whole project corpus just to answer one panel's selected or assigned state. If graph summary refs and payload relationships disagree, narrow to payload-backed evidence instead of inventing fallback nodes.

## Mutation

Use `useAction()` for feature-side node writes:

```ts
const { transact, insert, update, delete: deleteNode } = useAction();
```

Rules:

- batch related writes inside one `transact(...)`
- pass the real payload object returned by node hooks into `update(...)`
- update every persisted relationship owner in the same transaction
- for inserts, build exactly one `InsertByType<'node_type'>['payload']` object and pass `{ node_type, id, payload }` to `insert(...)`
- keep complex write orchestration in feature helpers, not in UI event handlers

Good local patterns:

- `src/features/project/rpb/ai-assistance-swimlane/rechtsgrundlage/AiTopicNormContext.tsx`
- `src/features/project/mvp/topic-detail-screen/screen-content/rechtsgrundlage-dialog/saveNormSelectionChanges.ts`

For add/remove flows like `topic -> topic_norm -> norm`, follow the persisted edge owners exactly. Read the mutation rule file before editing.

If a feature-owned write depends on backend-derived graph summary fields such as computed `parents`, use `useNodeSummaryRefetchOnTrackedPersistence()` from the route or feature owner and track `tx.isPersisted.promise`. Do not add feature-level node-summary polling, broad tree reloads, or leaf-mounted summary refetch ownership.

## MVP Patterns

Use MVP as the reference for:

- topic-scoped descendant reads
- keeping lane content visible during metadata refresh
- loading broad corpora only behind a dialog or secondary surface
- scoping `frontend_parent_ids` lookups to the active topic/dialog instead of the whole project

Look at:

- `src/features/project/mvp/topic-detail-screen/TopicDetailScreen.tsx`
  - `useDescendantNodes('dokument', topicRef)` for required topic documents
- `src/features/project/mvp/topic-detail-screen/screen-content/MvpFundstellenContext.tsx`
  - ref-first traversal with non-blocking fundstellen payload reads
- `src/features/project/mvp/topic-detail-screen/screen-data/useRechtsgrundlageData.ts`
  - `useNodesByType(...)` only in the dialog-backed corpus loader

## RPB Patterns

Use RPB as the reference for:

- ref-first detail views
- chaining a few narrow `useNode(...)` calls from known ids
- leaf-owned descendant payload reads
- node-backed checkbox/toggle mutations

Look at:

- `src/features/project/rpb/ai-assistance-swimlane/rechtsgrundlage/AiNormDetailView.tsx`
  - keep `topicNormRef` and `normRef` narrow before resolving payloads
- `src/features/project/rpb/ai-assistance-swimlane/rechtsgrundlage/AiSatzRow.tsx`
  - chain `useNode(...)` for one known linked node at a time
- `src/features/project/rpb/ai-assistance-swimlane/rechtsgrundlage/AiTopicNormContext.tsx`
  - mutate the actual `topic_norm` payload through `useAction`

## Loading And Suspense

Keep loading states tied to real payload dependencies.

- If primary content depends on payloads, `useNode` / `useNodes` plus a scoped `Suspense` boundary is fine.
- If only optional metadata is loading, use `useLiveNode` / `useLiveNodes`.
- Prefer small row/card boundaries over one broad boundary that blanks an entire pane.
- Do not add skeletons for graph-summary data that is already guaranteed.

For node-backed lists and detail panes:

- Read route search once in the nearest list/lane owner with `route.useSearch({ select: ... })` when many visible rows need selection state.
- Pass narrow values such as `selectedId`, `isSelected`, or `openDetail` to rows instead of having every node leaf read broad route search.
- Do not key a whole lane, tab, or panel `Suspense` boundary on route-backed node selection ids. Keep the shell mounted and swap only the selected detail owner.
- Use `useDeferredValue(...)` for heavy selected detail consumers when route selection should update click/focus feedback before payload work catches up.

## Review Checklist

- Read the matching node rules first.
- Keep refs until payloads are actually needed.
- Choose `useNode` for one known node, `useNodes` for required batches, `useLiveNodes` for optional enrichment.
- Use `useDescendantNodes` only when descendant payloads are the true working set.
- Derive relationships from persisted edges, not labels.
- Scope `frontend_parent_ids` queries to the active slice.
- Keep renderable node leaves on raw payload objects instead of scalar prop mirrors.
- Use `NodePayloadByType<'...'>` instead of mirror types.
- Mutate through `useAction`; use generated `InsertByType<'...'>['payload']` for inserts.
- Keep node-summary refresh centralized; track persisted writes instead of polling or reloading feature trees.
- Avoid broad route-search subscriptions and whole-lane keyed remounts in node-backed lists/details.
- Avoid editing `src/db/nodes/**` unless the task truly belongs there.
- Remove obsolete mocks once the feature is node-backed.
- Add tests for the exact read/mutation path you changed.
