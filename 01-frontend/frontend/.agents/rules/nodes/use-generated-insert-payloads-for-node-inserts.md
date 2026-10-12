---
ruleId: nodes/use-generated-insert-payloads-for-node-inserts
---

# Use Generated Insert Payloads for Node Inserts

- When hand-building a node insert before `useAction().insert(...)`, build exactly one `const payload: InsertByType<'node_type'>['payload'] = { ... }` object.
- Include only fields this frontend call intentionally changes. Do not add optional or backend-managed fields such as `projectVersion`, `isOutdated`, or null placeholder fields just to satisfy a full node response type.
- Pass the generated insert action to `insert(...)`, for example `{ nodeType: 'topic_norm', id, payload }`. Let `useAction().insert(...)` add optimistic collection metadata such as `compositeKey`, `projectId`, `isDeleted`, `createdAt`, and `updatedAt`.
- Do not create feature-local mirror, `Pick`, or `Omit` payload types for inserts when `InsertByType<'...'>['payload']` already exists.

## Bad Example

```ts
const payload = {
  nodeType: 'topic_norm' as const,
  id,
  compositeKey,
  projectId: verfahrenId,
  projectVersion: projectVersion,
  topicId: topicId,
};

insert(payload);
```

## Good Example

```ts
import type { InsertByType } from '@/db/nodes/types';

type TopicNormInsertPayload = InsertByType<'topic_norm'>['payload'];

const payload: TopicNormInsertPayload = {
  topicId: topicId,
  type: 'pruefung',
  mvpStatus: 'unchecked',
  satzStatuses: {},
  frontendParentIds: [topicCompositeKey],
  updateType: 'manual',
  jurabk,
  paragraphNr,
};

insert({
  nodeType: 'topic_norm',
  id,
  payload,
});
```
