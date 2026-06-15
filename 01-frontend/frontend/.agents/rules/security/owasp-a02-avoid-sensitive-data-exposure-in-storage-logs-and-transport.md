# OWASP A02: Avoid Sensitive Data Exposure in Storage, Logs, and Transport

- Covers OWASP A02 Cryptographic Failures.
- Do not store tokens, secrets, or sensitive personal data in `localStorage`, `sessionStorage`, or URL params unless there is an explicit reviewed requirement.
- Do not log tokens, secrets, or PII to the console or telemetry.
- Do not introduce hardcoded `http://` or `ws://` endpoints for sensitive flows.

## Bad Example

```tsx
localStorage.setItem('accessToken', token);
console.log('signed in', token, user.email);
```

## Good Example

```tsx
authSession.set(token);
logger.info('signed in');
```
