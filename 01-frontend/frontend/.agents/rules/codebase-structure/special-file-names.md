---
ruleId: codebase-structure/special-file-names
paths:
  - "src/**"
---

# Special File Names

Use when creating, moving, or reviewing TypeScript files under `src/features`.

## Policy

Special file suffixes must communicate ownership and allowed contents. Prefer a domain or workflow name before the suffix, and keep tests colocated with the file under test.

File names are independent from folder casing: folders use `kebab-case`, React
component files use `PascalCase.tsx`, and hook/helper/data files use
`camelCase.ts` plus the suffix rules below.

Locale JSON file names are the exception for translation resources: use
`de-<owner>.json` and `en-<owner>.json`, where `<owner>` is the owning
`kebab-case` feature or subfeature namespace.

## Suffix Rules

- `*.search.ts`: TanStack Router search schemas and search-state helpers only.
- `*.preload.ts`: route preload and loading orchestration only.
- `*.route-logic.ts`: pure helpers for route loaders, route layouts, and route decisions.
- `*.swimlanes.tsx`: Project swimlane root composition only. This file sits
  one folder above named `<thing>-swimlane/` folders and owns `<Swimlanes>`
  usage, lane/group configuration, lane ids, and cross-swimlane wiring.
- `*.logic.ts`: pure deterministic logic for one screen, lane, capability slice, or data owner.
- `*.reducer.ts`: reducer state, actions, and pure reducer transitions for one owner.
- `*.types.ts`: handwritten types shared by multiple files in the same owner.
- `*.schema.ts`: Zod, form, or API-boundary validation schemas.
- `*.collection.ts`: TanStack DB collections.
- `*.query.ts`: TanStack Query options and helpers when a collection does not fit.
- `*.mutation.ts`: mutation helpers that are not tied to one component event handler.
- `*.constants.ts`: stable constants only; do not mix business logic into constants files.
- `*.test.ts` and `*.test.tsx`: colocated tests for the file or owner they cover.
- `*.story.tsx`: UI and design-system examples only.

## Discouraged Names

Use `*.helpers.ts` only when no clearer suffix fits. Prefer `*.logic.ts`, `*.route-logic.ts`, `*.schema.ts`, `*.query.ts`, or a domain-specific filename.

For feature-owned page, screen, and swimlane entrypoint names, follow
`feature-folder-templates.md`. Do not use `index.ts`, `index.tsx`, `page.tsx`,
or broad `Content.tsx` entrypoints under `src/features`.

Avoid broad files named:

- `types.ts`
- `utils.ts`
- `helpers.ts`
- `constants.ts`

If one of these already exists, keep it only when it is small, single-owner, and clearer than a domain-specific name.

## Review Findings

Report:

- suffixes whose contents do not match this rule
- route search or preload code living outside `route/` or the owning screen folder
- route-backed feature, screen, or swimlane entrypoint names that violate
  `feature-folder-templates.md`
- `<Swimlanes>` root composition in broad screen/page files instead of a
  sibling `*.swimlanes.tsx` file above the named swimlane folders
- `*.swimlanes.tsx` files that contain lane-local content, backend data logic,
  route definitions, or reusable UI primitive code
- feature-wide types or schemas buried inside one lane or screen
- tests separated from the owner they exercise
- new broad `utils`, `helpers`, `components`, or `hooks` buckets where a domain/workflow name would be clearer
- PascalCase or camelCase locale JSON names, such as `deAuditLog.json`
- locale JSON names that are not `de-<kebab-owner>.json` or
  `en-<kebab-owner>.json`
