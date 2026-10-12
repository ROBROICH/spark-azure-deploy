---
ruleId: security/owasp-a06-audit-vulnerable-and-outdated-components
---

# OWASP A06: Audit Vulnerable and Outdated Components

- Covers OWASP A06 Vulnerable and Outdated Components.
- Review auth, sanitizer, parser, crypto, and telemetry dependencies with extra care.
- Do not introduce a new runtime dependency for sensitive behavior without checking its maintenance and security posture.
- Treat high or critical audit findings in runtime paths as blocking until reviewed.

## Bad Example

```tsx
import insecureMarkdown from 'random-markdown-package';
```

## Good Example

```tsx
import { marked } from 'marked';
import DOMPurify from 'dompurify';
```
