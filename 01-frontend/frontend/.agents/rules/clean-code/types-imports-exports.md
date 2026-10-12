---
ruleId: clean-code/types-imports-exports
---

# Types, Imports, and Exports

Use when code changes type declarations, object shape checks, imports/exports, null handling, or declaration order.

## Rules

- Use `type` instead of `interface` for handwritten props, state, object types, and app types. This avoids accidental declaration merging and keeps style consistent.
- For API, request, response, and DTO types, follow
  `../api-integration/derive-types-from-generated-and-existing-types.md`. That
  rule owns handwritten wire types.
- Prefer string/number union types over TypeScript `enum` in handwritten app, feature, test, utility, and shared types. Do not rewrite generated OpenAPI or other generated code solely for enum usage.
- Use `satisfies` when an object literal must conform to a known shape while preserving inference. Prefer it over broad casts that hide missing or extra fields.
- Do not create `index.ts` or `index.tsx` barrel files for re-exporting. Import directly from the source file so ownership and import paths stay traceable.
- Import specific members instead of namespace imports. Allowed namespace-style exceptions: `react`, `zod`, `@sentry/react`, TanStack Query, TanStack Router, local `tanstack-query/*` or `tanstack-router/*` integration modules, library-documented namespace APIs, dynamic access that is unavoidable, and tests where namespace shape improves mocking.
- Outside those exceptions, a namespace import needs a narrow lint suppression with a concrete reason.
- Define constants, variables, classes, enums, and type aliases before first read. If a helper must be referenced earlier, use a function declaration or extract the helper instead of relying on forward `const` references or hoisting surprises.
- Do not use postfix non-null assertions to silence nullable values. Narrow with guards, early returns, invariant checks, validated helpers, or boundary-level encoding. If a missing value is exceptional, throw a clear error where the invariant is established.
- For `noUncheckedIndexedAccess` failures, classify the access before fixing:
  - internal algorithm invariants, length-checked paired loops, queues, and non-empty config arrays: use `invariant` from `es-toolkit/util` with a short domain-specific message.
  - user, backend, async, route, search, or virtualized UI data: guard with `return`, `continue`, `null` render, or an existing feature fallback.
  - lookup tables and palettes: use the existing default option or neutral UI fallback; do not invent empty-string fallbacks unless the feature already treats empty string as valid.
  - parsing from `split`, regex matches, URLs, dates, or markdown tokens: validate pieces at the boundary and return the existing safe invalid result instead of coercing missing pieces.
  - tests: prefer local variables, optional access after existing assertions, or a tiny file-local helper when repeated; do not add a shared test helper for one-off mock-call indexing.
- Do not use `.at()`, `Map#get`, `head`, `last`, or package `get` helpers as a narrowing workaround. They still return `undefined` for normal arrays/maps; pair them with a guard, fallback, or invariant when a defined value is required.
- Use `isNotNil` from `es-toolkit` only when filtering optional values is the intended behavior. Do not filter away missing values when the missing case should fail fast or show a user-visible fallback.

## Report When

Report interfaces/enums in handwritten code, broad casts where `satisfies` should protect a mapping, new barrels, unjustified namespace imports, forward-reference ordering, `!` operators that bypass available narrowing, and strict indexed-access fixes that hide real missing-data behavior.

## Human Triage Suggestion

Suggest the exact mechanical direction: convert to `type`, convert enum to a union, replace cast with `satisfies`, import directly, reorder/extract declarations, add an invariant guard where data enters, or choose the existing fallback/early return for indexed access that can really be absent.
