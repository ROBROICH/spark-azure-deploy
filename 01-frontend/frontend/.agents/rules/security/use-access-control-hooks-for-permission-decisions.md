# Use AccessControl Hooks for Permission Decisions

- Feature code must use the canonical permission helpers from `src/features/access-control/` instead of hand-rolling role, owner, member, or topic-assignee checks.
- Use `useCanMutateProject({ requiredLevel })` for project-scoped mutation guards. `requiredLevel: 'owner'` is for project team changes, and `requiredLevel: 'user'` is for ordinary project edits.
- Use `useHasTopicMutationRights()` before mutating a `topic` field or a topic-owned graph descendant. Use the pure `hasTopicMutationRights(...)` helper only in tests, pure utilities, or other code that already has the full permission context.
- Mutation handlers must fail closed with an early return when the relevant AccessControl hook denies permission or cannot resolve the owning project/topic.
- Do not import `useCurrentUser`, project `owners` / `members`, or topic assignment arrays directly into feature mutation handlers to make authorization decisions, unless the code is implementing the AccessControl helper itself.
- Non-security display code may read identity, role, or assignment data for labels, filters, badges, and disabled UI, but those reads do not replace mutation guards.

Precedence: [guard-project-team-mutations-with-owner-rights.md](./guard-project-team-mutations-with-owner-rights.md) owns the exact project mutation levels. [guard-topic-mutations-with-topic-rights.md](./guard-topic-mutations-with-topic-rights.md) owns topic-scoped mutation behavior and the `mvp_assignees` assignment exception.

## Bad Example

```tsx
const { role, userId } = useCurrentUser();
const canEdit = role === 'admin' || project.owners.includes(userId);

const saveTopicNorm = () => {
  if (!canEdit) {
    return;
  }

  update(topicNorm, (draft) => {
    draft.mvp_checked = true;
  });
};
```

## Good Example

```tsx
const hasTopicMutationRights = useHasTopicMutationRights();

const saveTopicNorm = () => {
  if (!hasTopicMutationRights(topicNorm.topic_id)) {
    return;
  }

  update(topicNorm, (draft) => {
    draft.mvp_checked = true;
  });
};
```
