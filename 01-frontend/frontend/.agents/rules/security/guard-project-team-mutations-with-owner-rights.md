# Guard Project Team Mutations With Owner Rights

- Project read access is backend-enforced; frontend code may assume users can read all data for projects returned by the backend.
- Use `useCanMutateProject({ requiredLevel })` for frontend project mutation guards: `requiredLevel: 'owner'` for changing `owners` / `members`, and `requiredLevel: 'user'` for editorial project changes such as applicant address, project details, and deadlines.
- Changing project `owners` or `members` is a project-team mutation and must be guarded so only project owners, or admins acting as implicit owners, can perform it.
- Project members who are not owners may be assigned to topics, but membership alone must not allow changing project owners or members.
- During review, flag owner/member assignment handlers, dialogs, connected pickers, or endpoint calls that mutate project team arrays without a fail-closed project-owner guard.

## Bad Example

```tsx
const handleTeamChange = (nextMembers: string[]) => {
  updateProjectMembers(projectId, nextMembers);
};
```

## Good Example

```tsx
const { canMutateProject } = useCanMutateProject({ requiredLevel: 'owner' });

const handleTeamChange = (nextMembers: string[]) => {
  if (!canMutateProject) {
    return;
  }

  updateProjectMembers(projectId, nextMembers);
};
```
