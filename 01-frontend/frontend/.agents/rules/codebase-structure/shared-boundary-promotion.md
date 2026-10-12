---
ruleId: codebase-structure/shared-boundary-promotion
paths:
  - "src/**"
---

# Shared Boundary Promotion

Use when reviewing or restructuring `src/features/shared`, nested `shared/` folders, or any folder that has become a loose collection of unrelated capabilities.

## Policy

Do not treat `shared/` as the final owner for code with its own domain language, lifecycle, data source, or API. Analyze shared folders as boundary candidates and promote real capabilities to named owners.

## Boundary Detection

For every direct child of a `shared/` folder, classify it as one of:

- `true-shared`: neutral helper used by multiple unrelated owners with no product lifecycle.
- `support-feature`: reusable capability or enablement used by product features.
- `product-subfeature`: user-facing workflow that belongs under one product feature.
- `data-capability`: collections, query/mutation helpers, domain data transforms, or backend-facing state.
- `route-shell`: route layout, providers, navigation, sidebars, skeletons, or shell composition.
- `misplaced-ui`: reusable primitive or UI state helper that belongs under `src/features/ui`.

Promote anything except `true-shared` to a named owner.

## Promotion Targets

Prefer these targets:

- App shell/navigation/current-project chrome -> `src/features/app-shell/`.
- Access, identity, role, or permission behavior -> `src/features/access-control/`.
- Feedback capture, feedback lookup, or reusable feedback controls -> `src/features/feedback/`.
- Workflow status, running workflow reads, progress prediction, Temporal workflow enablement, system load, and fake progress -> `src/features/workflow-runtime/`.
- Verfahren route shell, navbar, action sidebar shell, and route skeletons -> `src/features/project/`.
- Comments workflow -> `src/features/project/comments/`.
- Supplementary request/request-list workflow -> `src/features/project/nachforderungen/`.
- Audit log shown in the Verfahren workspace -> `src/features/project/audit-log/`.
- Document tree, file tree, file processing, preview/download helpers tied to Verfahren documents -> `src/features/project/data/` or the nearest Project screen owner.
- FVP availability, plausibility contradiction reads, and workflow-specific result data -> `src/features/project/fvp/`.
- Dev-only route surfaces -> `src/features/dev-tools/`.
- Static information pages such as changelog and accessibility -> `src/features/app-info/`.

## Evidence

Use imports, route usage, naming, tests, and data dependencies to decide ownership.

Strong signals that a cluster deserves its own owner:

- It has multiple files, tests, schemas, hooks, and UI pieces.
- Callers import it from several features because no named owner exists.
- It owns a backend collection, query, mutation, workflow status, or lifecycle.
- It has product language in the folder name, file names, or translation keys.
- It imports product features from app-wide shared code.

Weak signals:

- A single small pure helper used by several unrelated owners.
- A browser/API boundary helper with no product language.
- A small adapter that is only a convenience around existing primitives.

## Review Findings

Report:

- `shared/` clusters that should be promoted to named support features or product subfeatures
- any reintroduced `src/features/project/shared`
- app-wide shared modules that import product features
- project/workspace shared modules hiding route-shell, workflow, comments, requests, documents, or versioning ownership
- one-owner modules left in shared only because they are reused from nearby files
- proposed promotions that would require behavior changes; mark these blocked instead of fixing silently
