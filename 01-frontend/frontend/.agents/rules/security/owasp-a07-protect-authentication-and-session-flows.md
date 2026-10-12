---
ruleId: security/owasp-a07-protect-authentication-and-session-flows
---

# OWASP A07: Protect Authentication and Session Flows

- Covers OWASP A07 Identification and Authentication Failures.
- Review login, logout, session expiry, and token persistence flows with security in mind.
- Do not persist long-lived auth tokens in insecure client storage by default.
- Require re-auth or equivalent confirmation for sensitive actions when the flow demands it.

## Bad Example

```tsx
localStorage.setItem('refreshToken', refreshToken);
await deleteWorkspace();
```

## Good Example

```tsx
await promptForReauthentication();
await deleteWorkspace();
```
