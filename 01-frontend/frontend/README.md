# Frontend (User Interface)

React frontend for the SPARK Workflow application.

The frontend provides the browser-based workflow UI, connects generated API
clients to backend services, and hosts shared UI, routing, translation, upload,
and client-state infrastructure.

## Core Features

- **Workflow dashboard:** Shows project and workflow state under the configured application base path.
- **Feature modules:** Groups user-facing workflows into self-contained React feature folders.
- **Generated API clients:** Uses OpenAPI-generated TypeScript clients for backend communication.
- **Internationalization:** Maintains German and English translations with German as the fallback language.

## Architecture

### Overview

The application is built with Vite, React 19, TypeScript, TanStack Router,
TanStack Query, TanStack DB, TanStack Form, Tailwind CSS, Radix UI, and Vitest.

Routes live in `src/routes` and render feature entry components from
`src/features`. Shared code is kept in `src/features/shared`, reusable UI
primitives live in `src/features/ui`, and generated API clients live in
`src/api-clients`.

### Components

- **Routes:** TanStack Router file-based route definitions in `src/routes`.
- **Features:** Domain-oriented React modules in `src/features`.
- **Shared frontend infrastructure:** API setup, upload helpers, config helpers, error states, and common hooks.
- **UI primitives:** Reusable design-system components in `src/features/ui`.
- **API clients:** Generated OpenAPI clients in `src/api-clients`.
- **Runtime configuration:** Values injected through `.env.local` in development and `window.__APP_CONFIG__` in container deployments.

### Dependencies

| Module / Service | Purpose |
| --- | --- |
| **Backend API services** | Provide project, document, identity, workflow, feedback, and protocol data. |
| **Temporal job API** | Provides workflow job data and links to external workflow details. |
| **Object storage** | Receives uploaded files through backend-provided presigned URLs. |

### Data Models

Generated API model types are stored with their generated clients in
`src/api-clients`. Do not hand-edit generated files; regenerate them from the
OpenAPI inputs instead.

### API Endpoints

Frontend API clients derive their base URLs from `VITE_API_BASE_URL` and append
service-specific paths such as `/pls/v1`, `/dms/v1`, `/identity`, and
`/temporal`.

## Project Structure

The target structure is defined in `.agents/rules/codebase-structure`. Use
`fe-codebase-structure` when auditing or changing it.

```text
├── .agents/                # Agent rules and public frontend skills
├── public/                 # Static public assets
├── src/
│   ├── api-clients/        # Generated API clients
│   ├── db/                 # Data platform and nodes infrastructure
│   ├── features/           # Product features, support features, and UI primitives
│   │   └── feature-name/
│   │       ├── route/
│   │       ├── data/
│   │       ├── <workflow>-screen/
│   │       └── shared/
│   ├── i18n/
│   ├── integrations/
│   ├── routes/             # Thin route declarations
│   ├── scripts/
│   └── test/
├── eslint-plugins/         # Local ESLint rules
├── openapi-ts.config.ts    # OpenAPI client generation config
└── vite.config.ts          # Vite development and build config
```

Feature folders use `kebab-case` and should own their local components, hooks,
tests, and utilities.
Move code to `src/features/shared` only when multiple features genuinely share
it. Put reusable design-system primitives in `src/features/ui`.

Avoid creating new generic root folders and product-feature buckets such as
`components`, `hooks`, `utils`, or `types` when a workflow or capability owner
exists.

### Agent Guidance

The `.agents/rules` folder contains important code conventions for this
frontend. Load the relevant rule folder before changing code in areas such as
accessibility, API integration, clean code, forms, internationalization, nodes,
security, or codebase structure.

The public frontend agent skills in `.agents/skills` cover common maintenance
workflows:

- `fe-code-review`: review local changes, branch diffs, feature folders, or
  pull requests against the frontend rules.
- `fe-codebase-structure`: audit or normalize `src/` and `src/features`
  structure before moving files or creating new feature shapes.
- `fe-lint-fixer`: fix scoped lint, type-check, test, or other
  `pnpm run check` failures.
- `fe-regression-review-dev`: review `dev...HEAD` runtime TypeScript changes
  for regressions introduced by the current branch.
- `fe-with-nodes`: wire backend data through the shared nodes layer or replace
  mocks with node-backed hooks.

## Getting Started

### Prerequisites

- Node.js 24.x
- pnpm 10.30.2
- Local backend service forwards or another development API environment

### Environment Variables

Local configuration is read from `.env.local`. Start by copying
`.env.local.example`, then adjust only the values needed for your setup.

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Base URL used by generated API clients. | local dev: `localhost:3000`, production: `/api` |
| `VITE_APP_BASE_PATH` | Vite base path and frontend route prefix. | `/app` |
| `VITE_TEMPORAL_UI_BASE_URL` | Base URL for links from workflow data to the Temporal UI. | - |
| `VITE_ALLOWED_DOWNLOAD_ORIGINS` | Comma-separated exact HTTPS origins trusted for signed file download and preview URLs. | - |
| `VITE_ALLOWED_UPLOAD_ORIGINS` | Comma-separated exact HTTPS origins trusted for signed file upload URLs. | - |
| `VITE_SENTRY_DSN` | Error reporting DSN. Leave empty to disable reporting locally. | - |
| `VITE_SENTRY_ENVIRONMENT` | Error reporting environment label. | `local` |
| `VITE_ENABLE_EWMS_FEATURE` | Enables the EWMS feature. | `true` |
| `VITE_ENABLE_AUTH_REDIRECT_RETRY` | Retries once after session refresh before showing the session-expired dialog. | `true` |
| `VITE_ENABLE_MAINTENANCE_MODE` | Enables the maintenance-mode screen. | `false` |
| `VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE` | Blocks AI workflow starts at or above this system load percentage. | `500` |
| `VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE` | Enables document update and versioning actions. | `true` |
| `VITE_DANGEROUS_ENABLE_ROLE_SWITCHER` | Enables the testing-only role switcher for permission testing. Keep this `false` in production environments. | `false` |
| `ALLOW_DEV_MODE` | Allows the hidden dev-mode toggle. Keep this `false` in production environments. | `false` when unset |
| `VITE_LOCAL_USER_ID` | Fallback current-user ID for local development. | - |
| `VITE_LOCAL_USER_EMAIL` | Fallback current-user email for local development. | `local-dev@example.test` |
| `VITE_LOCAL_USER_FIRST_NAME` | Fallback current-user first name for local development. | `Local` |
| `VITE_LOCAL_USER_LAST_NAME` | Fallback current-user last name for local development. | `Developer` |

Vite also uses the OpenAPI variables to derive local proxy targets for
`pnpm dev:port-forwarding`.

| Variable | Local proxy path | Generated client output |
| --- | --- | --- |
| `VITE_PLS_OPENAPI_URL` | `/pls/v1` | `src/api-clients/pls-module` |
| `VITE_DMS_OPENAPI_URL` | `/dms/v1` | `src/api-clients/dms-module` |
| `VITE_FCS_OPENAPI_URL` | `/fcs/v1` | `src/api-clients/fcs-module` |
| `VITE_AOM_OPENAPI_URL` | `/agent-orchestration/v1` | `src/api-clients/agent-orchestration-module` |
| `VITE_TEMPORAL_JOBS_OPENAPI_URL` | `/temporal` | `src/api-clients/temporal-jobs-module` |
| `VITE_PNS_OPENAPI_URL` | `/plausibility-notes/v1` | `src/api-clients/pns-module` |
| `VITE_OMS_OPENAPI_URL` | `/oms/v1` | `src/api-clients/oms-module` |
| `VITE_SUPPLEMENTARY_REQUESTS_OPENAPI_URL` | `/supplementary-requests/v1` | `src/api-clients/supplementary-requests-module` |
| `VITE_COMMENTS_OPENAPI_URL` | `/comment/v1` | `src/api-clients/comments-module` |
| `VITE_EXAMINATION_OPENAPI_URL` | `/examination/v1` | `src/api-clients/examination-module` |
| `VITE_VAE_OPENAPI_URL` | `/vae/v1` | `src/api-clients/vae-module` |
| `VITE_LAW_CHANGES_OPENAPI_URL` | `/law-changes/v1` | `src/api-clients/law-changes-module` |
| `VITE_IDENTITY_MANAGEMENT_OPENAPI_URL` | `/identity` | `src/api-clients/identity-management-module` |
| `VITE_FEEDBACK_OPENAPI_URL` | `/feedback/v1` | `src/api-clients/feedback-module` |
| `VITE_PROTOCOL_OPENAPI_URL` | `/protocol/v1` | `src/api-clients/protocol-module` |

Do not commit secrets, credentials, generated tokens, or personal test values.

### Running the Module / Service

#### In Development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.local.example .env.local
   ```

3. Start the development server:

   ```bash
   pnpm dev:port-forwarding
   ```

The app runs on port `3000` and is served under the configured app base path.

#### In Production

1. Build the application:

   ```bash
   pnpm build
   ```

2. Serve the generated `dist` output with nginx. Container deployments inject
   runtime config into `index.html` before nginx starts.

For a local production-build preview that uses the same port-forwarding proxy
setup as development, run:

```bash
pnpm preview:port-forwarding
```

## Common Commands

```bash
pnpm dev:port-forwarding      # Start the development server
pnpm preview:port-forwarding  # Build and preview dist with port-forwarding proxies
pnpm build                    # Production build and TypeScript check
pnpm lint                     # Run ESLint
pnpm check                    # Run all pre-commit checks
pnpm test                     # Run Vitest once
pnpm test:coverage            # Run Vitest with coverage output
pnpm type-check               # Run TypeScript without emitting files
pnpm openapi-ts               # Regenerate generated API clients from OpenAPI specs
```

Run `pnpm check` before committing. For smaller in-progress changes, at least
run the command that matches the files you touched.

## Development Notes

### Dev Mode

Dev mode is available only when `ALLOW_DEV_MODE=true`. When that environment
variable is set to `true`, click the SPARK Workflow logo in the left sidebar
seven times to toggle the `DEV_MODE` localStorage value.

Keep `ALLOW_DEV_MODE=false` for production environments.

Dev mode enables these developer features:

- Load monitor details in the left sidebar, including workflow-type breakdowns
  with running counts and complexity totals.
- Role switching in the left sidebar via
  `src/features/access-control/current-user/RoleSwitcher.tsx`, with separate controls for
  frontend role mocks and Keycloak-backed roles in testing and staging.
- Nodes Dev Tools in the right Verfahren sidebar, including graph statistics,
  schema graph, and data graph views for the current project.
- A running workflows drawer in the right Verfahren sidebar that shows the most recent
  Temporal workflow for each type for the current Verfahren, with live durations.
- Access to `/design-system`, a component showcase for UI primitives, layouts,
  feedback states, and developer-only UI demos.

Role switching is for testing permissions only. The role switcher is available
only when Dev Mode is active, the runtime environment is local development,
testing, or staging, and `VITE_DANGEROUS_ENABLE_ROLE_SWITCHER=true`.

The Keycloak-backed role-switching control calls `POST /me/roles` to update the
authenticated user's changeable realm roles. That backend route is testing-only
and requires privileged OIDC credentials through `AUTH_PRIVILEGED_REALM`,
`AUTH_PRIVILEGED_CLIENT_ID`, and `AUTH_PRIVILEGED_CLIENT_SECRET`.

Do not enable `VITE_DANGEROUS_ENABLE_ROLE_SWITCHER` or configure the privileged
backend OIDC credentials in production.

### Access Control Note

Topic assignee changes for `mvp_assignees` are intentionally enforced by the
frontend assignment UI. Other topic-scoped writes still require the canonical
topic mutation permission guard, and project visibility and project role changes
must rely on backend-enforced authorization.

### Routing

Routing uses TanStack Router file-based routes in `src/routes`.

- Route files should stay thin and render feature entry components.
- Use TanStack Router navigation and search params for URL state.
- Do not manually edit `src/routeTree.gen.ts`; it is generated by the router plugin.

### API Clients and Data

Regenerate clients after backend schema changes:

```bash
pnpm openapi-ts
```

Client configuration is centralized in `src/integrations/api-clients/configureClients.ts`.
Server-backed state should use the existing TanStack DB, TanStack Query, and
nodes patterns already present in the relevant feature.

### Internationalization

> **Disclaimer:** This solution is designed and developed specifically for use in German public administration and government agencies (Behörden). Its terminology, workflows, and processes are aligned with the requirements, conventions, and legal framework of the German public sector.
>An English translation of the user interface is provided to improve accessibility for non-German-speaking users. The English translation is offered on a best-effort basis and has not been validated by domain experts or legal professionals. Technical terms, official designations, and legally relevant wording may therefore not accurately reflect their precise meaning in the context of administrative or legal practice

Translations live beside the owning feature code as `de-*.json` and
`en-*.json` files. `src/i18n/resources.ts` imports those feature-owned locale
files into the central i18n registry. German is the default and fallback
language, with English translations maintained alongside it.

When adding or changing user-facing copy:

1. Add or update the key in the relevant German locale file.
2. Add or update the matching key in the English locale file.
3. Use `useTranslation` from `react-i18next` inside the feature component.

### Testing

Tests use Vitest and React Testing Library. Co-locate tests with the source
files they cover.

Add regression tests for bug fixes and meaningful coverage for shared behavior,
data transformations, routing logic, and user-visible workflows.

### Styling and UI

Styling uses Tailwind CSS 4 and reusable primitives from `src/features/ui`.
Prefer existing UI components before introducing a new primitive. Keep
feature-specific styling inside the feature that owns the UI.

Radix UI is used for accessible low-level primitives. When building forms, use
the existing TanStack Form patterns and co-locate schemas with the form feature.

### Generated and Local Files

Do not manually edit:

- `src/routeTree.gen.ts`
- files under `src/api-clients`
- build output
- coverage output
- local-only environment files

Local files such as `.env.local`, temporary logs, coverage output, and generated
debug artifacts should stay out of commits unless the repository explicitly
tracks them.

## Troubleshooting

- If the app cannot reach backend services in local development, verify the
  `VITE_*_OPENAPI_URL` values and active port forwards.
- If route changes do not appear, restart the Vite server so TanStack Router can
  regenerate route metadata.
