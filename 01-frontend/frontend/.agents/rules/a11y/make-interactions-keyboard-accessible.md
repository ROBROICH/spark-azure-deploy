---
ruleId: a11y/make-interactions-keyboard-accessible
---

# Make Interactions Keyboard Accessible

- Use semantic interactive elements such as `button`, `a`, `input`, and `label`.
- Do not create pointer-only interactions.
- Do not add positive `tabIndex` values.
- Add appropriate `aria-*` attributes and image alt text where needed.
- All interactive elements must have a visible focus indicator. Use the `focus-ring` Tailwind utility class — do not write manual `focus-visible:ring-*` / `focus:ring-*` / `focus:outline-*` chains inline.

## Bad Example

```tsx
<div onClick={onOpenDetails}>Open details</div>

<button
  className="rounded-lg px-3 py-1 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
>
  Open details
</button>
```

## Good Example

```tsx
<button type="button" onClick={onOpenDetails} aria-label="Open details">
  Open details
</button>

<button className="focus-ring rounded-lg px-3 py-1">
  Open details
</button>
```
