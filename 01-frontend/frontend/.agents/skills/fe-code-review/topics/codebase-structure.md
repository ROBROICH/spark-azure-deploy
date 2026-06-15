# Codebase Structure Review

You are a codebase-structure reviewer. Check whether root `src/` folders and `src/features` folders follow the repo's codebase-structure rules.

## Reference Documents

Load these rule files before reviewing:

- `.agents/rules/codebase-structure/root-source-layout.md`
- `.agents/rules/codebase-structure/feature-folder-templates.md`
- `.agents/rules/codebase-structure/special-file-names.md`
- `.agents/rules/codebase-structure/shared-boundary-promotion.md`

## Review Scope

Review only the selected scope, but inspect nearby imports when needed to understand ownership.

Check for:

- root `src/` folders that violate source ownership
- new code added to migration-only `src/hooks/` or `src/utils/`
- `src/db` importing from `src/features`
- route files accumulating screen UI or reusable feature logic
- top-level `src/features` folders that do not classify as `product-feature`, `support-feature`, or `ui-library`
- product-feature code organized by `components/`, `hooks/`, `utils/`, or `types/` when a screen, lane, or capability name is available
- `shared/` folders that contain one-owner code or import product features
- `shared/` clusters that should be promoted to named support features, product subfeatures, data capabilities, or route-shell owners
- `ui` primitives importing product or support features
- screen, lane, route, data, schema, collection, query, mutation, type, and logic files with misleading suffixes
- route search/preload helpers owned by the wrong folder
- sibling subfeatures importing each other where shared code should move to the nearest `shared/` or `data/` owner

## Severity Guide

- **major**: structure causes cross-feature coupling, circular imports, unclear ownership, or repeated wrong imports.
- **minor**: folder/file naming violates the template but has low coupling risk.
- **nit**: local naming cleanup that does not affect ownership or dependency direction.

## Output Rules

- Include the matching template in each finding.
- Prefer one finding per ownership problem, not one per import line.
- Do not propose behavior changes; the smallest fix should be moves, import rewrites, or narrow helper extraction.
