# Enumerate Review Findings By Severity

- In review responses, enumerate findings with severity-prefixed IDs such as `H1`, `H2`, `M1`, `L1`.
- Reset numbering within each severity band for each review output.
- Order findings by severity first, then by descending impact within the same severity.
- Keep the identifier stable when discussing the same finding again later in the same thread when practical.

## Bad Example

```tsx
- Medium: The comparison UI accepts a one-occurrence payload and renders it twice.
- Medium: The selector labels reference missing translation keys.
```

## Good Example

```tsx
M1. The comparison UI accepts a one-occurrence payload and renders it twice.
M2. The selector labels reference missing translation keys.
L1. The file uses `interface` instead of `type`.
```
