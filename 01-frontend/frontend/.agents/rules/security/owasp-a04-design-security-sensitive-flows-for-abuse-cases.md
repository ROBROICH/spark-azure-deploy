---
ruleId: security/owasp-a04-design-security-sensitive-flows-for-abuse-cases
---

# OWASP A04: Design Security-Sensitive Flows for Abuse Cases

- Covers OWASP A04 Insecure Design.
- Do not build flows whose safety depends on frontend-only assumptions.
- Consider abuse cases for rate-sensitive actions, unsafe defaults, and weak workflow constraints.
- Push security-critical decisions to server-enforced checks instead of trusting client state.

## Bad Example

```tsx
const canApprove = selectedItems.length > 0;

if (canApprove) {
  return <button onClick={approveAll}>Approve all</button>;
}
```

## Good Example

```tsx
const canApprove = selectedItems.length > 0;

return (
  <button type="button" onClick={requestApproval} disabled={!canApprove}>
    Approve all
  </button>
);
```
