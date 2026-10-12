---
ruleId: security/owasp-a01-no-ui-only-authorization
---

# OWASP A01: No UI-Only Authorization

- Covers OWASP A01 Broken Access Control.
- Do not treat hidden buttons, route guards, or client-side role checks as real authorization.
- Assume users can bypass UI-only restrictions and reach privileged flows directly.
- Security-sensitive actions must rely on server-enforced authorization, not frontend visibility rules alone.

## Bad Example

```tsx
if (!currentUser.isAdmin) {
  return null;
}

return <button onClick={deleteProject}>Delete project</button>;
```

## Good Example

```tsx
const canDelete = currentUser.permissions.includes('project:delete');

return (
  <button type="button" onClick={deleteProject} disabled={!canDelete}>
    Delete project
  </button>
);
```
