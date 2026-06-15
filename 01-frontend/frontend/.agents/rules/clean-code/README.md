# Clean Code Rules

Canonical, compressed rules for frontend maintainability and AI-slop review. This folder replaces the former `code-conventions`, `linting`, `component-architecture`, `state-and-routing`, `performance`, and `testing` rule clusters when the concern is code shape rather than a domain topic such as a11y, API integration, i18n, nodes, or security.

## Load Policy

- Load only the rule file whose trigger matches the changed code or review lane.
- For `fe-entslopify`, treat these files as the source of truth for deciding whether code looks AI-shaped, over-abstracted, under-verified, or release-unready.
- For lint-driven work, start from the tool output, then load the owning clean-code rule file to decide the smallest safe fix.
- Keep examples and rationale in `references/`; workers should open them only when a rule match is ambiguous.

## Canonical Files

- `abstraction-and-boundaries.md` — ownership, wrapper, context, adapter, duplication, and speculative-control-plane smells.
- `components-and-jsx.md` — focused components, JSX extraction, nested components, suspense wrappers, navigation ownership, and prop signatures.
- `state-effects-routing.md` — `useEffect`, `useState`, TanStack Router, `<Link>`, URL state, and controllable state.
- `types-imports-exports.md` — types, enums, `satisfies`, imports, barrels, forward references, and null narrowing.
- `comments-jsdoc-suppressions.md` — comment hygiene, English comments, TODOs, JSDoc, and lint/TS suppressions.
- `control-flow-and-size.md` — braces, early returns, nesting, oversized files/functions, mapping objects, and repeated domain literals.
- `async-performance.md` — waterfalls, serial async, debouncing, virtualization, children composition, and React Compiler memoization.
- `styling-ui-primitives.md` — Tailwind, verified tokens, shared UI primitives, and feature-specific logic boundaries.
- `testing-verification.md` — risk-based tests, regressions, meaningful assertions, and co-location.
- `project-maintenance-couplings.md` — small repo-specific maintenance couplings that agents often miss.
