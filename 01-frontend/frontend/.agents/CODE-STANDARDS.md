# Code Standards

Index of the frontend rules. Keep this file compact; add policy as one rule file in the matching `.agents/rules/`
folder and load only the rules whose trigger matches the touched code during work or review.

## Load Order

1. Inspect the requested files or diff first.
2. Read the baseline rules below for every TypeScript or TSX change.
3. Add a rule from the other sections only when the touched code matches its trigger. Load library rules
   (React, TanStack, Radix) only when the application's package metadata or source confirms that library.
4. A rule with `paths` frontmatter applies only below those paths of `01-frontend/frontend`.
5. Use `.agents/behavior/` for agent conduct rules.

## Baseline

- [Abstraction and Boundaries](./rules/clean-code/abstraction-and-boundaries.md)
- [Control Flow and Size](./rules/clean-code/control-flow-and-size.md)
- [Types, Imports, and Exports](./rules/clean-code/types-imports-exports.md)
- [Testing and Verification](./rules/clean-code/testing-verification.md)

## Clean Code

- [Components and JSX](./rules/clean-code/components-and-jsx.md) — React components, JSX ownership, context, hooks, or composition.
- [State, Effects, and Routing](./rules/clean-code/state-effects-routing.md) — route state, search parameters, navigation, effects, or synchronized state.
- [Comments, JSDoc, and Suppressions](./rules/clean-code/comments-jsdoc-suppressions.md) — comments, JSDoc, lint suppressions, or disabled checks.
- [Async and Performance](./rules/clean-code/async-performance.md) — async work, concurrency, repeated requests, or expensive rendering.
- [Styling and UI Primitives](./rules/clean-code/styling-ui-primitives.md) — Radix or shared UI primitive styling.
- [Project Maintenance Couplings](./rules/clean-code/project-maintenance-couplings.md) — changelog, locale registry, route generation, or another coupled artifact.

## API Integration

- [Validate Data at System Boundaries](./rules/api-integration/validate-data-at-system-boundaries.md) — API, storage, URL, form, or untrusted data boundaries.
- [Derive Types from Generated and Existing Types](./rules/api-integration/derive-types-from-generated-and-existing-types.md) — generated or existing types.
- [Use Generated API Clients and Regenerate from OpenAPI](./rules/api-integration/use-generated-api-clients-and-regenerate-from-openapi.md) — generated clients, handwritten wire types, or OpenAPI regeneration.
- [Prefer TanStack DB Collections for Server-Backed State](./rules/api-integration/prefer-tanstack-db-collections-for-server-backed-state.md) — TanStack DB or server-backed client collections.
- [Use useQuery Only When a TanStack DB Collection Does Not Fit](./rules/api-integration/use-usequery-only-when-tanstack-db-collection-does-not-fit.md) — TanStack Query or a proposed `useQuery`.
- [Use Workflow Hooks By Need](./rules/api-integration/use-workflow-hooks-by-need.md) — workflow runtime hooks or feature access to workflow state.
- [Handle Request Errors with User-Visible Feedback](./rules/api-integration/handle-request-errors-with-user-visible-feedback.md) — request failures or user-visible async operations.

## Codebase Structure

For new, moved, renamed, or reorganized files below `src/`:

- [Root Source Layout](./rules/codebase-structure/root-source-layout.md)
- [Feature Folder Templates](./rules/codebase-structure/feature-folder-templates.md)
- [Project Swimlane Owners](./rules/codebase-structure/project-swimlane-owners.md)
- [Special File Names](./rules/codebase-structure/special-file-names.md)
- [Shared Boundary Promotion](./rules/codebase-structure/shared-boundary-promotion.md)

## Nodes

Load only the group that matches the requested nodes work, and only when the source confirms nodes use.
The [nodes guide](./rules/nodes/README.md) explains hook usage and existing feature examples.

- Reads and typing: [Prefer Node Refs Until Payload Is Needed](./rules/nodes/prefer-node-refs-until-payload-is-needed.md), [Derive Node Types from Hooks and `NodePayloadByType`](./rules/nodes/derive-node-types-from-hooks-and-nodepayloadbytype.md), [Keep Leaf Node Payloads Raw](./rules/nodes/keep-leaf-node-payloads-raw.md).
- Relationships: [Derive Relationships from Persisted Node Edges](./rules/nodes/derive-relationships-from-persisted-node-edges.md), [Model Edges from Child `frontend_parent_ids`](./rules/nodes/model-edges-from-child-frontend-parent-ids.md), [Scope `frontend_parent_ids` Queries To The Active Slice](./rules/nodes/scope-frontend-parent-queries-to-the-active-slice.md), [Treat Graph Summary Refs as Hints Until Payloads Confirm Them](./rules/nodes/treat-graph-summary-refs-as-hints-until-payloads-confirm-them.md).
- Loading and selection: [Keep Optional Node Metadata Non-Suspending](./rules/nodes/keep-optional-node-metadata-non-suspending.md), [Use Loading States Only for Real Node Dependencies](./rules/nodes/use-loading-states-only-for-real-node-dependencies.md), [Keep Node-Backed Lists Off Broad Route Search](./rules/nodes/keep-node-backed-lists-off-broad-route-search.md), [Avoid Keyed Remounts For Node Detail Lanes](./rules/nodes/avoid-keyed-remounts-for-node-detail-lanes.md).
- Mutations and freshness: [Run Node Mutations Via `useAction`](./rules/nodes/run-node-mutations-via-useaction.md), [Use Generated Insert Payloads for Node Inserts](./rules/nodes/use-generated-insert-payloads-for-node-inserts.md), [Keep Node Summary Refresh Centralized](./rules/nodes/keep-node-summary-refresh-centralized.md).
- Migration and platform boundaries: [Remove Mocks After Node Migration](./rules/nodes/remove-mocks-after-node-migration.md), [Flag `src/db/nodes` Changes in Review](./rules/nodes/flag-db-nodes-changes-in-review.md).

## Security

- [Use AccessControl Hooks for Permission Decisions](./rules/security/use-access-control-hooks-for-permission-decisions.md) — permission decisions in feature code.
- [Guard Project Team Mutations With Owner Rights](./rules/security/guard-project-team-mutations-with-owner-rights.md) — Project-team mutations.
- [Guard Topic Mutations With Topic Rights](./rules/security/guard-topic-mutations-with-topic-rights.md) — Topic mutations.
- [OWASP A01: No UI-Only Authorization](./rules/security/owasp-a01-no-ui-only-authorization.md) — authorization enforced only in UI.
- [OWASP A02: Avoid Sensitive Data Exposure in Storage, Logs, and Transport](./rules/security/owasp-a02-avoid-sensitive-data-exposure-in-storage-logs-and-transport.md) — secrets, personal data, storage, logs, or transport.
- [OWASP A03: Avoid Injection and Unsafe HTML Rendering](./rules/security/owasp-a03-avoid-injection-and-unsafe-html-rendering.md) — HTML rendering, query construction, or untrusted interpolation.
- [OWASP A04: Design Security-Sensitive Flows for Abuse Cases](./rules/security/owasp-a04-design-security-sensitive-flows-for-abuse-cases.md) — security-sensitive workflows or abuse cases.
- [OWASP A05: Secure Frontend Configuration, Links, and Redirects](./rules/security/owasp-a05-secure-frontend-configuration-links-and-redirects.md) — runtime configuration, redirects, or external links.
- [OWASP A06: Audit Vulnerable and Outdated Components](./rules/security/owasp-a06-audit-vulnerable-and-outdated-components.md) — dependency or package changes.
- [OWASP A07: Protect Authentication and Session Flows](./rules/security/owasp-a07-protect-authentication-and-session-flows.md) — authentication, sessions, cookies, or tokens.
- [OWASP A08: Protect Software and Data Integrity](./rules/security/owasp-a08-protect-software-and-data-integrity.md) — generated code, persisted state, import/export, or integrity-sensitive data.
- [OWASP A09: Avoid Security-Blind Logging and Monitoring Gaps](./rules/security/owasp-a09-avoid-security-blind-logging-and-monitoring-gaps.md) — security logging, audit events, or monitoring.
- [OWASP A10: Fail Closed on Security-Relevant Errors](./rules/security/owasp-a10-fail-closed-on-security-relevant-errors.md) — security-relevant error handling or fallbacks.

## a11y

- [Make Interactions Keyboard Accessible](./rules/a11y/make-interactions-keyboard-accessible.md) — custom interaction, keyboard behavior, or clickable non-controls.
- [Require Accessible Names for Icon-Only Actions](./rules/a11y/require-accessible-names-for-icon-only-actions.md) — icon-only buttons or actions.
- [Connect Form Controls to Labels and Errors](./rules/a11y/connect-form-controls-to-labels-and-errors.md) — form controls, labels, or validation errors.
- [No Manual ARIA on Radix Primitives](./rules/a11y/no-manual-aria-on-radix-primitives.md) — Radix accessibility props or primitives.

## i18n

For JSX copy, translation keys, or feature locale JSON:

- [Change Visible Copy Only When Requested](./rules/i18n/change-visible-copy-only-when-requested.md)
- [Translate Inside Feature Components](./rules/i18n/translate-inside-feature-components.md)
- [Update Both Locale Files for New Translation Keys](./rules/i18n/update-both-locale-files-for-new-translation-keys.md)
- [Update English Locale When German Copy Changes](./rules/i18n/update-english-locale-when-german-copy-changes.md)
- [Use Correct German UI Copy](./rules/i18n/use-correct-german-ui-copy.md)

## Forms

- [Use TanStack Forms](./rules/forms/use-tanstack-forms.md) — TanStack Form.
- [Co-Locate Form Schemas with Feature Forms](./rules/forms/co-locate-form-schemas-with-feature-forms.md) — feature forms or form schemas.

## Agent Behavior

- [Enumerate Review Findings By Severity](./behavior/enumerate-review-findings-by-severity.md)
- [Require Approval Before Git Publish](./behavior/require-approval-before-git-publish.md)
