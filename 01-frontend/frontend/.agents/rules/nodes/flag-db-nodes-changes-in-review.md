---
ruleId: nodes/flag-db-nodes-changes-in-review
---

# Flag `src/db/nodes` Changes in Review

- In code review, treat any production-code diff under `src/db/nodes/**` as an automatic finding, even before you assess whether the implementation is correct.
- `src/db/nodes/**` is the locked nodes subsystem: graph building, providers, node hooks, query plumbing, and related cache behavior live there so feature work does not casually rewrite that platform surface.
- Require an explicit justification for why the change belongs inside `src/db/nodes/**` instead of a feature folder, route file, or a narrower extension point.
- Even when the task explicitly asked for nodes-subsystem work, still call out that the diff crossed the locked boundary and review it with extra scrutiny for API drift, graph-semantics drift, or widened coupling.

## Why

- Changes in `src/db/nodes/**` affect many screens at once.
- Small edits there can silently alter graph semantics, payload queries, cache reuse, or hook contracts across the app.
- Always flagging the boundary crossing keeps reviewers from treating infrastructure edits like routine feature churn.

## Bad Example

```diff
+ import { useGraph } from '@/db/nodes/hooks/useGraph';
+
+ export function TopicCardBadge() {
+   // quick fix: tweak the shared graph hook here so this card can read one more field
+ }
```

## Good Example

```diff
+ // Review finding: this diff edits src/db/nodes/ProjectGraphProvider.tsx.
+ // Flag the boundary crossing first, then assess whether the subsystem change is justified.
```
