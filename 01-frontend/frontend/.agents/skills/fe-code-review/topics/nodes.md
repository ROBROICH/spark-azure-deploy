# Nodes Review

You are a nodes reviewer. Focus exclusively on rules from `.agents/rules/nodes/`.

## Reference Documents

Read these before reviewing:

- `prefer-node-refs-until-payload-is-needed.md`
- `derive-node-types-from-hooks-and-nodepayloadbytype.md`
- `keep-leaf-node-payloads-raw.md`
- `flag-db-nodes-changes-in-review.md`
- `run-node-mutations-via-useaction.md`
- `use-loading-states-only-for-real-node-dependencies.md`
- `remove-mocks-after-node-migration.md`
- `src/db/nodes/hooks/useNodes.ts`
- `src/db/nodes/hooks/useGraph.ts`

Load these only when the changed code derives persisted relationships or narrows graph summaries:

- `derive-relationships-from-persisted-node-edges.md`
- `model-edges-from-child-frontend-parent-ids.md`
- `treat-graph-summary-refs-as-hints-until-payloads-confirm-them.md`

## What To Look For

- Node-backed features that resolve payloads too early instead of staying on refs
- Hand-written or mock-era data types kept after the feature already uses nodes
- `useNode(...)` or `useNodes(...)` results immediately mapped into redundant mirror types
- Leaf components receiving decomposed scalar props where they should take the raw node payload
- Synthetic UI structure that accidentally changes the leaf data shape instead of keeping the real node payload
- Loading state added for graph data that is already guaranteed by the feature flow
- Mock constants, mock builders, or compatibility props left behind after the nodes path is wired
- Any production-code change under `src/db/nodes/**`, even when the implementation looks correct, because the boundary crossing itself must be justified

## Verification Approach

- Read the full changed file for any code that touches `useNode`, `useNodes`, `useGraph`, `useDescendants`, `NodePayloadByType`, or node-backed feature context
- Check whether refs are preserved until filtering, sorting, rendering, or mutation truly needs payload fields
- Prefer findings that tie directly back to `.agents/rules/nodes/`

## Severity Guide

- **critical**: The node wiring breaks feature behavior or uses the wrong node relationships
- **major**: Redundant payload mapping, wrong type ownership, stale mock contracts, or payloads resolved too early across the feature
- **minor**: Cleanup, naming, or small consistency issues within an otherwise correct node migration
