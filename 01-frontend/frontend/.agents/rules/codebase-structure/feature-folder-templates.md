---
ruleId: codebase-structure/feature-folder-templates
paths:
  - "src/**"
---

# Feature Folder Templates

Use when creating, moving, reviewing, or restructuring code under `src/features`.

## Policy

Every immediate child of `src/features` must match one of these templates:

- `product-feature`: route-backed screens, user workflows, and dev/content screens.
- `support-feature`: reusable product capabilities or app infrastructure used by product features.
- `ui-library`: reusable UI primitives; this is reserved for `src/features/ui`.

If a folder cannot be classified, report it as a structure outlier before moving files.

All folders under `src/features` use `kebab-case`, including top-level feature
owners and nested folders. Acronym route owners stay lowercase, such as `ewms`,
`fvp`, `mvp`, and `rpb`. React files may stay `PascalCase.tsx`; hook, helper,
and data files use `camelCase.ts`.

## Product Feature Template

Use for route or workflow owners such as `main-page`, `project`,
`schwaerzungsagent`, and nested product features such as `mvp`.

```text
feature-name/
├── route/
├── data/
├── <subfeature>-screen/
└── shared/
```

Rules:

- Split by user-visible subfeature or workflow first, not by file type.
- Name route-level or tab-level owners `<thing>-screen`.
- Name lane or pane workflows `<thing>-lane`.
- Name Project workflows backed by `src/features/ui/swimlanes` `<thing>-swimlane`;
  see `project-swimlane-owners.md`.
- Put dialogs under the workflow that owns them, usually `<thing>-dialog`.
- Use `shared/` only for code used by at least two sibling subfeatures in the same feature.
- Use `data/` only for feature-wide data, domain helpers, schemas, collections, queries, and mutations.
- Avoid product folders named `components/`, `hooks/`, `utils/`, or `types/` when a workflow name is available.

Preferred nested shape:

```text
topic-check-screen/
├── TopicCheckScreen.tsx
├── topic-check.logic.ts
├── topic-check.search.ts
├── documents-lane/
├── fundstellen-lane/
├── rechtsgrundlagen-lane/
└── shared/
```

## Entry Point File Names

Use role-specific entrypoint names instead of `index.ts`, `index.tsx`,
`page.tsx`, or broad `Content.tsx` names.

- `<PascalOwner>Page.tsx`: route-backed owner when the folder itself owns a route.
- `<PascalOwner>Screen.tsx`: screen owner inside a `<thing>-screen/` folder.
- `<owner>.swimlanes.tsx`: Project `Swimlanes` root composition; see
  `project-swimlane-owners.md`.
- `<PascalThing>Swimlane.tsx`: lane entry inside a `<thing>-swimlane/` folder.

Rules:

- Match the PascalCase stem to the owning folder or established route acronym:
  `ewms/EwmsPage.tsx`, `rpb/RpbPage.tsx`,
  `topic-detail-screen/TopicDetailScreen.tsx`.
- Keep tests and skeletons aligned with the entrypoint stem, such as
  `TopicDetailScreen.test.tsx` and `DocumentsSwimlaneSkeleton.tsx`.
- Keep route search, preload, and route-specific schemas in `*.search.ts` or
  `*.preload.ts`; do not encode those as page entrypoints.
- Do not create `index.ts` or `index.tsx` barrels or entrypoints.
- This applies to feature-owned files under `src/features`; TanStack Router
  declarations under `src/routes` keep their router-required file names.

## Support Feature Template

Use for capabilities, enablement, and infrastructure such as access control, feedback, workflow status, versioning, system load, and app shell composition.

```text
feature-name/
├── <capability-slice>/
├── data/
├── ui/
└── shared/
```

Rules:

- Prefer domain capability slices over generic `hooks/`, `logic/`, or `components/` folders.
- A small support feature may expose a top-level hook such as `useDevMode.ts`
  when that hook is the feature's canonical API and no separate capability
  slice would add ownership clarity.
- Keep capability-owned UI in `ui/` only when it is not a reusable primitive.
- Support features may depend on `ui` and `shared`, but must not become pass-through dumping grounds for product-screen code.
- App shell composition belongs in a support feature such as `app-shell`, not in `src/features/shared`.
- Promote reusable enablement hidden in `shared/` to a support feature when it owns a lifecycle, backend state, workflow status, or domain vocabulary.

## UI Library Template

Use only for reusable primitives in `src/features/ui`.

```text
ui/
├── button/
├── dialog/
├── form/
└── cards/
```

Rules:

- Do not import product or support features into `ui`.
- Keep component tests and stories colocated with the primitive.
- Primitive folders may depend on other primitives.
- Do not put route state, API calls, domain data, or product workflow logic in `ui`.

## Feature-Owned Locale Files

Locale JSON files are owned by the feature or subfeature whose namespace they
serve. Keep them beside that owner, not under `src/i18n/locales`.

Rules:

- Use `de-<owner>.json` and `en-<owner>.json`, where `<owner>` is the owning
  `kebab-case` folder or namespace.
- Keep the German and English files in the same directory with matching suffixes.
- Put broad namespaces at the broad owner, such as
  `src/features/project/de-project.json`.
- Put specific namespaces in their feature folder, such as
  `src/features/project/audit-log/de-audit-log.json`.
- Keep existing namespaces separate during structure cleanup; do not merge or
  rename translation namespaces unless the user asks for an i18n behavior change.
- Register every locale pair in `src/i18n/resources.ts`.

Report:

- locale JSON files under `src/i18n/locales/**`
- unpaired `de-*.json` or `en-*.json` files
- locale file names that do not match `de-<kebab-owner>.json` or
  `en-<kebab-owner>.json`
- feature-owned locale files missing from `src/i18n/resources.ts`
- `src/i18n/resources.ts` imports pointing to missing or centrally stored locale
  files

## Review Findings

Report:

- top-level folders that do not match a template
- folders under `src/features` that are not `kebab-case`
- generic product folders where a workflow name is available
- route-backed feature, screen, or swimlane entrypoints that use `index.ts`,
  `index.tsx`, `page.tsx`, generic `Content.tsx`, or a role suffix that does
  not match their owner
- `shared/` code used by only one owner
- `shared/` or `ui` importing product features
- sibling subfeatures importing each other instead of moving shared logic to the nearest `shared/` or `data/` owner
- Project screens using `src/features/ui/swimlanes` without named
  `<thing>-swimlane` owners
- feature-owned locale JSON files that violate placement, naming, pairing, or
  registry rules
