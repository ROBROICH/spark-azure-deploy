# Styling and UI Primitives Review

You are a styling-and-ui-primitives reviewer. Use `.agents/rules/clean-code/styling-ui-primitives.md` as the canonical rule file.

## What to Look For

- Custom UI built where an existing `src/features/ui/` primitive already fits.
- Feature-specific logic or domain assumptions leaking into reusable UI primitives.
- Tailwind/token drift, unverified CSS variables in arbitrary values, or styled-components usage.
- One-off styling APIs that duplicate local variants without a stable product decision.
- Primitive changes that alter behavior or visual semantics for unrelated consumers.

## Verification Approach

- Inspect nearby UI primitives before recommending new component extraction.
- Check whether a style/token choice is already established in the touched feature.
- Tie findings directly to `styling-ui-primitives.md`.

## Severity Guide

- **critical**: Primitive or styling changes break shared behavior or critical UI readability.
- **major**: New custom primitives, leaked feature logic, or styling drift likely to spread.
- **minor**: Small consistency or token cleanup.

