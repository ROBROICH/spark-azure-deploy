---
ruleId: nodes/remove-mocks-after-node-migration
---

# Remove Mocks After Node Migration

- After a feature or folder is wired to live nodes data, delete the obsolete mock data, mock tree builders, and mock-only prop contracts that are no longer used.
- Keep temporary adapters only when they are still required by an unfinished downstream migration. In that case, leave an actionable TODO that names the remaining dependency.
- Rename old mock-driven state or prop names when the live node-backed terminology is clearer and already established in the feature.
- Do not leave both the mock path and the node-backed path active when the feature has already switched to the nodes API.

## Why

- Dual data paths rot quickly and make debugging harder.
- Mock-era names and types keep pulling future changes back toward the wrong abstraction.
- Cleaning up immediately keeps the migration scoped and reduces follow-up churn.

## Bad Example

```tsx
const cards = useTopicOverviewCards();
const topics = nodeTopics || [];
```

## Good Example

```tsx
const topics = topicData || [];
```

Then remove the old mock hook or mock constant from the migrated feature area when nothing else still depends on it.
