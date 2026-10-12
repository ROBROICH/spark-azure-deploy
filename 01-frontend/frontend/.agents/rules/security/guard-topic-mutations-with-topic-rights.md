---
ruleId: security/guard-topic-mutations-with-topic-rights
paths:
  - "src/features/project/**"
---

# Guard Topic Mutations With Topic Rights

- Project assignment is backend-enforced: admins have full access, project members can see assigned projects, and project owners can grant project-level approvals.
- Topic assignment is frontend-owned by product decision: assigning `mvp_assignees` may be enforced through the visible assignment UI only, and reviewers should not flag assignment handlers solely for lacking a second fail-closed guard.
- Before mutating other `topic` fields or any graph-backed descendant of a topic, require the canonical guard in `src/features/access-control/topic-permissions/hasTopicMutationRights.ts` to return `true` for the owning topic.
- The guard must allow admins, project owners, and users who are both current project members and assigned to that topic; stale topic assignee ids that are no longer project members must not mutate it.
- Treat graph descendants such as `topic_norm`, `dokument`, `satz`, `vae_node`, and assessment/check state as topic-scoped when a payload, route param, parent edge, or `topic_id` connects them to a topic.
- During review, flag topic-scoped mutation handlers that call `useAction`, `transact`, `update`, descendant assignment endpoints, workflow starts, or local write callbacks without a fail-closed topic-rights guard, except handlers that only assign `mvp_assignees`.
- This is the explicit exception to “no UI-only authorization” for topic assignment; project visibility and project role assignment still rely on backend-enforced authorization.
- Precedence: this rule owns the product-approved exception for assigning
  `mvp_assignees`. [OWASP A01](./owasp-a01-no-ui-only-authorization.md) remains
  authoritative for every other security-sensitive action.

## Bad Example

```tsx
const { transact, update } = useAction();

const toggleTopicNormChecked = (topicNorm: NodePayloadByType<'topic_norm'>) => {
  transact(() => {
    update(topicNorm, (draft) => {
      draft.mvp_checked = !draft.mvp_checked;
    });
  });
};
```

## Good Example

```tsx
const { transact, update } = useAction();
const hasTopicMutationRights = useHasTopicMutationRights();

const toggleTopicNormChecked = (
  topicId: string,
  topicNorm: NodePayloadByType<'topic_norm'>,
) => {
  if (!hasTopicMutationRights(topicId)) {
    return;
  }

  transact(() => {
    update(topicNorm, (draft) => {
      draft.mvp_checked = !draft.mvp_checked;
    });
  });
};
```
