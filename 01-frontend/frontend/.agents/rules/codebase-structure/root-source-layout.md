# Root Source Layout

Use when creating, moving, or reviewing folders directly under `src/`.

## Policy

Root `src/` folders are platform owners, generated surfaces, or the feature tree. Do not add new generic root buckets. New product code should usually go under `src/features` and follow the feature rules in `.agents/rules/codebase-structure/`.

## Allowed Root Folders

- `api-clients/`: generated OpenAPI clients. Do not hand-edit or manually restructure.
- `assets/`: global static assets only, such as fonts and licenses.
- `db/`: app data platform and TanStack DB infrastructure. Features may import `db`; `db` must not import features.
- `features/`: product features, support features, and UI primitives. All
  folders under `features/` use `kebab-case`.
- `i18n/`: translation runtime, locale registry, date locale helpers, and i18n
  types. Locale JSON files live beside their owning feature and are registered
  in `src/i18n/resources.ts`.
- `integrations/`: runtime adapters for router, Sentry, TanStack Query, and similar app-level integrations.
- `routes/`: thin TanStack Router route declarations that delegate to feature owners.
- `scripts/`: repo, build, validation, and development scripts.
- `test/`: test setup and global test infrastructure.

## Removed Migration Buckets

`src/hooks/` and `src/utils/` must stay absent. Do not recreate them; place code
in the nearest named owner.

Preferred destinations:

- Node transaction and graph hooks -> `src/db/nodes/hooks/`
- UI viewport or UI state hooks -> `src/features/ui/`
- App-wide browser storage helpers -> `src/features/shared/`
- App-wide search/text helpers -> `src/features/shared/`
- Date formatting and locale-aware helpers -> `src/i18n/` when they are i18n-owned, otherwise the nearest feature owner
- Class-name composition helpers used by UI primitives -> `src/features/ui/`

## Route Rules

- Routes stay thin: validate search, load route data, compose route providers, and render feature entrypoints.
- Route helpers may live in the owning feature's `route/` folder or owning screen folder.
- Do not put reusable feature logic in `src/routes`.

## Review Findings

Report:

- new root folders that are not in the allowed list
- any reintroduced `src/hooks/` or `src/utils/`
- `db` importing from `features`
- generated `api-clients` files edited by hand
- route files accumulating screen UI or reusable feature logic
- locale JSON files under `src/i18n/locales/**` instead of beside the owning
  feature
- `src/i18n/resources.ts` imports that point to missing files or old central
  locale folders
