# Frontend Agent Guide

This file is for AI coding assistants working in `01-frontend/frontend`.
Keep it short. Project setup, architecture, environment variables, and command
details belong in [README.md](README.md).

## Start Here

1. Load the frontend rules before direct planning, edits or review: read
   [.agents/CODE-STANDARDS.md](.agents/CODE-STANDARDS.md), its baseline rules and
   only the rules whose triggers match the selected code.
2. Read [README.md](README.md) for the package overview, local setup, and
   current command list.
3. Inspect the existing feature or shared module before choosing an approach.
   Prefer local patterns over new abstractions.

## Common Commands

Use the README as the source of truth. These are the commands most often needed
during agent work:

```bash
pnpm dev:port-forwarding
pnpm build
pnpm check
pnpm lint
pnpm test
pnpm type-check
pnpm openapi-ts
```

Run the narrowest useful verification while iterating, then run `pnpm check`
before handing off when the change is ready.

## Codebase Shape

- Routes live in `src/routes` and should stay thin.
- Feature code lives in `src/features/<feature-name>` and all folders under
  `src/features` use `kebab-case`.
- Shared cross-feature code lives in `src/features/shared` only when there is
  real reuse across features.
- Reusable UI primitives live in `src/features/ui`.
- Generated API clients live in `src/api-clients`.
- TanStack DB and nodes integration lives in `src/db`.

## Implementation Expectations

- Keep changes scoped to the requested behavior.
- Use generated API client types and existing domain types instead of mirroring
  backend shapes by hand. Regenerate with `pnpm openapi-ts`. Handwritten wire
  types are a recorded mock exception only.
- Prefer TanStack Router for route state and navigation.
- Prefer existing TanStack Query, TanStack DB, and nodes patterns in the
  relevant feature before adding new data access code.
- Keep user-facing copy in the locale JSON files beside the owning feature;
  update German and English together.
- Prefer existing UI primitives and Radix/Tailwind patterns before adding a new
  component style.
- Add or update tests for bug fixes, shared logic, data transformations, route
  behavior, and user-visible workflows.

## Generated and Local Files

Do not manually edit generated files. Regenerate them with the appropriate
command instead.

- `src/routeTree.gen.ts`
- files under `src/api-clients`
- build output
- coverage output

Do not commit secrets, local credentials, generated tokens, `.env.local`, or
personal test data.

## Review Notes

For review work, lead with concrete findings: severity, file, line, impact, and
the smallest practical fix. Treat changes under `src/db/nodes` as platform-level
changes and review them carefully.
