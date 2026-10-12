---
ruleId: security/owasp-a03-avoid-injection-and-unsafe-html-rendering
---

# OWASP A03: Avoid Injection and Unsafe HTML Rendering

- Covers OWASP A03 Injection.
- Do not use `dangerouslySetInnerHTML`, direct `innerHTML`, `eval`, or string-built queries with untrusted input.
- Sanitize or transform rich content before rendering it.
- Build URLs and query strings with safe APIs instead of concatenating untrusted input.

## Bad Example

```tsx
return <div dangerouslySetInnerHTML={{ __html: commentHtml }} />;
```

## Good Example

```tsx
return <MarkdownRenderer source={sanitizedCommentHtml} />;
```
