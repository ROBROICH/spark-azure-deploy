---
ruleId: a11y/connect-form-controls-to-labels-and-errors
---

# Connect Form Controls to Labels and Errors

- Form inputs must have a programmatic label via `label`/`htmlFor` or a shared
  field primitive already owned by the selected application.
- Validation errors should be linked to the field with `aria-describedby` and announced with `role="alert"` when shown.
- Mark invalid fields explicitly with `aria-invalid` instead of relying on color alone.
- Reuse the selected application's existing field primitives when present;
  otherwise use semantic HTML instead of inventing an ad hoc abstraction.

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
<label htmlFor="request-title">Title</label>
<input
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
