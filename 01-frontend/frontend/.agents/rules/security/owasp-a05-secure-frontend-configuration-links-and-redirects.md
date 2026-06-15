# OWASP A05: Secure Frontend Configuration, Links, and Redirects

- Covers OWASP A05 Security Misconfiguration.
- Keep debug or insecure runtime configuration out of production defaults.
- Use `rel="noopener noreferrer"` with `target="_blank"`.
- Validate redirect targets instead of trusting arbitrary URL parameters.

## Bad Example

```tsx
<a href={searchParams.redirect} target="_blank">
  Open portal
</a>
```

## Good Example

```tsx
<a href={partnerPortalUrl} target="_blank" rel="noopener noreferrer">
  Open portal
</a>
```
