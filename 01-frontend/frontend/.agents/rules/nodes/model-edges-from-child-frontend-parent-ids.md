# Model Edges from Child `frontend_parent_ids`

- In this nodes model, persisted parent-child relationships live on the child payload via `frontend_parent_ids` and, in some paths, `parents`.
- Read graph direction from that stored child data. The graph builder turns those parent keys into parent-to-child edges.
- When a feature needs to know whether two nodes are related, prefer matching the child payload's `frontend_parent_ids` against the relevant parent or intermediate node composite keys.
- For `topic`, `topic_norm`, and `norm`, the stored edges are `topic -> topic_norm` from `topic_norm.frontend_parent_ids` and `topic_norm -> norm` from `norm.frontend_parent_ids` containing `topic_norm:<id>`.
- A `norm` is selected for a `topic` only when one of its `frontend_parent_ids` points to a `topic_norm` that belongs to that topic.
- Do not rebuild an existing graph relationship with semantic joins such as `jurabk + paragraph_nr` when the stored edge already answers the question.
