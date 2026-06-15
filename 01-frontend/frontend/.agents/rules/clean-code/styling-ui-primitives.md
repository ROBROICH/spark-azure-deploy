# Styling and UI Primitives

Use when code changes Tailwind classes, CSS tokens, shared UI primitives, or feature wrappers around UI components.

## Rules

- Do not introduce `styled-components` or similar styling systems in this project. Use Tailwind utilities and existing project primitives.
- Check `src/features/ui/` before creating custom button, input, textarea, card, label, skeleton, dialog, or other primitive-like UI. Import the specific component path, not a barrel.
- Treat `src/features/ui/` as the shared primitive layer. Do not move feature-specific state, business logic, or one-off behavior into it just to reuse a visual shell. Wrap primitives inside the feature folder when behavior is feature-owned.
- Changes in `src/features/ui/` should usually be primitive-level improvements, accessibility fixes, variant support, or styling adjustments that stay broadly reusable.
- Do not invent raw CSS variable names inside Tailwind arbitrary values. Prefer standard utilities such as `ring-*`, `border-*`, `shadow-*`, and semantic project token classes. If a token is needed, verify it exists in `src/styles.css` or the established token surface before using it.
- Use arbitrary values only with known existing tokens or justified literals the current styling system cannot express.

## Report When

Report custom primitive clones, feature logic leaking into `src/features/ui/`, `styled-components`, arbitrary Tailwind values with invented CSS vars, or styling that bypasses existing component/token conventions.

## Human Triage Suggestion

Suggest using the existing primitive, adding a reusable primitive-level variant, wrapping the primitive in the feature, replacing the arbitrary value with a Tailwind utility, or verifying/adding the token in the styling system.
