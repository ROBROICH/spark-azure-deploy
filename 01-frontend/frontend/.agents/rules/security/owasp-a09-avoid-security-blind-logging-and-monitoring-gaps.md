# OWASP A09: Avoid Security-Blind Logging and Monitoring Gaps

- Covers OWASP A09 Security Logging and Monitoring Failures.
- Do not leak secrets, tokens, or PII to logs or telemetry.
- Surface security-relevant failures consistently instead of swallowing them silently.
- Ensure auth failures, permission denials, and suspicious states remain observable to operators or users.

## Bad Example

```tsx
try {
  await verifyPermission();
} catch {
  console.debug('permission check failed', token);
}
```

## Good Example

```tsx
try {
  await verifyPermission();
} catch {
  logger.warn('permission check failed');
  toast.error('Permission check failed.');
}
```
