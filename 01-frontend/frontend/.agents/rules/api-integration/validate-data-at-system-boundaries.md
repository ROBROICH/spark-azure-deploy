# Validate Data at System Boundaries

- Do not use `as any` or `as unknown as`.
- Do not leave external data as `unknown` when a specific validated type can be established.
- Validate API, storage, and other boundary data before it enters the app.
- Prefer explicit parameter and return types.

## Bad Example

```tsx
const project = response as Project;
```

## Good Example

```tsx
const project: Project = projectSchema.parse(response);
```
