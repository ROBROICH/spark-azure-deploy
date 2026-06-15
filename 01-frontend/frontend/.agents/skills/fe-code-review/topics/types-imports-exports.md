# Types, Imports, and Exports Review

You are a types-imports-exports reviewer. Use `.agents/rules/clean-code/types-imports-exports.md` as the canonical rule file.

## What to Look For

- Handwritten `interface` or `enum` usage where the project expects `type` aliases and unions.
- Manual mirror types where generated API client types, node payload types, or existing domain types should be derived.
- Broad casts that should be replaced by `satisfies` shape checks or narrower validation.
- New `index.ts` / `index.tsx` barrels or imports that hide ownership.
- Namespace imports, forward references, parameter destructuring, or non-null assertions that violate clean-code guidance.
- Types exported from the wrong layer or public names that expose temporary implementation details.

## Verification Approach

- Read the full touched `.ts` or `.tsx` file, not just the changed lines.
- Inspect nearby generated or domain types when the finding depends on an existing type source.
- Tie findings directly to `types-imports-exports.md`.

## Severity Guide

- **critical**: Type drift that can hide unsafe data handling or break public contracts.
- **major**: Manual type mirrors, unsafe casts, import/export ownership drift, or patterns likely to spread.
- **minor**: Local consistency improvements with low behavior risk.

