---
ruleId: security/owasp-a08-protect-software-and-data-integrity
---

# OWASP A08: Protect Software and Data Integrity

- Covers OWASP A08 Software and Data Integrity Failures.
- Do not execute untrusted runtime code with `eval`, `new Function`, or equivalent patterns.
- Do not trust unreviewed remote config or generated code as executable logic.
- Review external script/style loading and supply-chain-sensitive paths for integrity controls.

## Bad Example

```tsx
const runRule = new Function(serverRuleBody);
runRule();
```

## Good Example

```tsx
const parsedRule = ruleSchema.parse(serverRuleConfig);
applyRuleConfig(parsedRule);
```
