# Require Accessible Names for Icon-Only Actions

- Icon-only buttons and controls must have an explicit accessible name.
- Use the `Button` API as intended: when `iconOnly` is `true`, provide `aria-label`.
- Keep the label action-oriented and specific to the control, not generic filler text.
- Decorative icons should stay decorative; the accessible name belongs on the control, not on the icon.

## Bad Example

```tsx
<Button variant="ghost" size="sm" iconOnly>
  <Pencil />
</Button>
```

## Good Example

```tsx
<Button
  variant="ghost"
  size="sm"
  iconOnly
  aria-label={t('Sidebar.commentsPanel.actions.editAria')}
>
  <Pencil />
</Button>
```
