# Treat Graph Summary Refs as Hints Until Payloads Confirm Them

- Graph summaries and descendant refs can outlive payloads. A ref returned by `getNodesByType(...)` or `useDescendants(...)` does not guarantee that every matching payload still exists.
- Do not batch-fetch broad sets of summary refs as required payloads unless the feature truly needs every payload.
- When a feature needs payloads for an intermediate relation such as `topic_norm`, narrow the ref set with payload-backed evidence from the current slice before calling `useNodes(...)`.
- For `topic_norm`, intersect the current topic's descendant `topic_norm` refs with the `topic_norm:<id>` keys found in `norm.frontend_parent_ids` instead of fetching every descendant `topic_norm` payload.
- If some summary refs resolve to missing payloads, treat that as stale summary data and narrow the query. Do not invent fallback payloads or widen the required preload set.
