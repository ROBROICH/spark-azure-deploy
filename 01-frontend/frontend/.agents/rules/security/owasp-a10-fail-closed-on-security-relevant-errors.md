---
ruleId: security/owasp-a10-fail-closed-on-security-relevant-errors
---

# OWASP A10: Fail Closed on Security-Relevant Errors

- Covers OWASP A10 Mishandling of Exceptional Conditions.
- Do not allow error fallbacks to silently grant access, skip validation, or continue sensitive actions.
- Handle auth, permission, and integrity failures as blocking conditions.
- Surface the failure safely instead of pretending the action succeeded.

## Bad Example

```tsx
try {
  await verifyPermission();
} catch {
  return proceedWithDelete();
}
```

## Good Example

```tsx
try {
  await verifyPermission();
  return proceedWithDelete();
} catch {
  toast.error('Permission check failed.');
  return;
}
```
