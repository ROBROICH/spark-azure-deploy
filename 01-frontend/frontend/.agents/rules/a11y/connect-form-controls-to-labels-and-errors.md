# Connect Form Controls to Labels and Errors

- Form inputs must have a programmatic label via `label`/`htmlFor` or the shared `FieldLabel` helpers.
- Validation errors should be linked to the field with `aria-describedby` and announced with `role="alert"` when shown.
- Mark invalid fields explicitly with `aria-invalid` instead of relying on color alone.
- Reuse the shared field primitives in `src/features/ui/form/field.tsx` before inventing ad hoc labeling or error patterns.

## Bad Example

```tsx
<Input
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  className={hasError ? 'border-red-500' : undefined}
/>;
{
  hasError && <span>Title is required</span>;
}
```

## Good Example

```tsx
<FieldLabel htmlFor="request-title">Title</FieldLabel>
<Input
  id="request-title"
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  aria-invalid={hasError}
  aria-describedby={hasError ? 'request-title-error' : undefined}
/>
{hasError && (
  <span id="request-title-error" role="alert">
    Title is required
  </span>
)}
```
