# Use Generated Insert Payloads for Node Inserts

- When hand-building a node insert before `useAction().insert(...)`, build exactly one `const payload: InsertByType<'node_type'>['payload'] = { ... }` object.
- Include only fields this frontend call intentionally changes. Do not add optional or backend-managed fields such as `project_version`, `sys_period`, `is_outdated`, or null placeholder fields just to satisfy a full node response type.
- Pass the generated insert action to `insert(...)`, for example `{ node_type: 'topic_norm', id, payload }`. Let `useAction().insert(...)` add optimistic collection metadata such as `compositeKey`, `project_id`, `is_deleted`, `created_at`, and `updated_at`.
- Do not create feature-local mirror, `Pick`, or `Omit` payload types for inserts when `InsertByType<'...'>['payload']` already exists.

## Bad Example

```ts
const payload = {
  node_type: 'topic_norm' as const,
  id,
  compositeKey,
  project_id: verfahrenId,
  project_version: projectVersion,
  sys_period: null,
  topic_id: topicId,
};

insert(payload);
```

## Good Example

```ts
import type { InsertByType } from '@/db/nodes/types';

type TopicNormInsertPayload = InsertByType<'topic_norm'>['payload'];

const payload: TopicNormInsertPayload = {
  topic_id: topicId,
  type: 'pruefung',
  mvp_status: 'unchecked',
  satz_statuses: {},
  frontend_parent_ids: [topicCompositeKey],
  update_type: 'manual',
  jurabk,
  paragraph_nr,
};

insert({
  node_type: 'topic_norm',
  id,
  payload,
});
```
