# Code Standards

Index of repository rules. Keep this file compact; add policy to `.agents/rules/` and load only the matching rule file during work or review.

## Load Order

1. Start with `.agents/rules/clean-code/` for maintainability, code quality, lint conventions, component/state/test design, and performance concerns.
2. Add domain folders only when the touched code triggers them: `a11y`, `api-integration`, `codebase-structure`, `forms`, `i18n`, `nodes`, or `security`.
3. Use `.agents/behavior/` for agent conduct rules.

## Clean Code

Canonical folder: [`rules/clean-code/`](./rules/clean-code/). It replaces the old code-conventions, linting, component-architecture, state-and-routing, performance, and testing clusters.

- [Abstraction and Boundaries](./rules/clean-code/abstraction-and-boundaries.md)
- [Components and JSX](./rules/clean-code/components-and-jsx.md)
- [State, Effects, and Routing](./rules/clean-code/state-effects-routing.md)
- [Types, Imports, and Exports](./rules/clean-code/types-imports-exports.md)
- [Comments, JSDoc, and Suppressions](./rules/clean-code/comments-jsdoc-suppressions.md)
- [Control Flow and Size](./rules/clean-code/control-flow-and-size.md)
- [Async and Performance](./rules/clean-code/async-performance.md)
- [Styling and UI Primitives](./rules/clean-code/styling-ui-primitives.md)
- [Testing and Verification](./rules/clean-code/testing-verification.md)
- [Project Maintenance Couplings](./rules/clean-code/project-maintenance-couplings.md)

## API Integration

- [Validate Data at System Boundaries](./rules/api-integration/validate-data-at-system-boundaries.md)
- [Derive Types from Generated and Existing Types](./rules/api-integration/derive-types-from-generated-and-existing-types.md)
- [Use Generated API Clients and Regenerate from OpenAPI](./rules/api-integration/use-generated-api-clients-and-regenerate-from-openapi.md)
- [Prefer TanStack DB Collections for Server-Backed State](./rules/api-integration/prefer-tanstack-db-collections-for-server-backed-state.md)
- [Use Workflow Hooks By Need](./rules/api-integration/use-workflow-hooks-by-need.md)
- [Use useQuery Only When a TanStack DB Collection Does Not Fit](./rules/api-integration/use-usequery-only-when-tanstack-db-collection-does-not-fit.md)
- [Handle Request Errors with User-Visible Feedback](./rules/api-integration/handle-request-errors-with-user-visible-feedback.md)

## Codebase Structure

- [Root Source Layout](./rules/codebase-structure/root-source-layout.md)
- [Feature Folder Templates](./rules/codebase-structure/feature-folder-templates.md)
- [Project Swimlane Owners](./rules/codebase-structure/project-swimlane-owners.md)
- [Special File Names](./rules/codebase-structure/special-file-names.md)
- [Shared Boundary Promotion](./rules/codebase-structure/shared-boundary-promotion.md)

## Nodes

- [Prefer Node Refs Until Payload Is Needed](./rules/nodes/prefer-node-refs-until-payload-is-needed.md)
- [Derive Relationships from Persisted Node Edges](./rules/nodes/derive-relationships-from-persisted-node-edges.md)
- [Model Edges from Child `frontend_parent_ids`](./rules/nodes/model-edges-from-child-frontend-parent-ids.md)
- [Treat Graph Summary Refs as Hints Until Payloads Confirm Them](./rules/nodes/treat-graph-summary-refs-as-hints-until-payloads-confirm-them.md)
- [Keep Node Summary Refresh Centralized](./rules/nodes/keep-node-summary-refresh-centralized.md)
- [Derive Node Types from Hooks and `NodePayloadByType`](./rules/nodes/derive-node-types-from-hooks-and-nodepayloadbytype.md)
- [Run Node Mutations Via `useAction`](./rules/nodes/run-node-mutations-via-useaction.md)
- [Keep Leaf Node Payloads Raw](./rules/nodes/keep-leaf-node-payloads-raw.md)
- [Keep Node-Backed Lists Off Broad Route Search](./rules/nodes/keep-node-backed-lists-off-broad-route-search.md)
- [Flag `src/db/nodes` Changes in Review](./rules/nodes/flag-db-nodes-changes-in-review.md)
- [Use Loading States Only for Real Node Dependencies](./rules/nodes/use-loading-states-only-for-real-node-dependencies.md)
- [Scope `frontend_parent_ids` Queries To The Active Slice](./rules/nodes/scope-frontend-parent-queries-to-the-active-slice.md)
- [Keep Optional Node Metadata Non-Suspending](./rules/nodes/keep-optional-node-metadata-non-suspending.md)
- [Avoid Keyed Remounts For Node Detail Lanes](./rules/nodes/avoid-keyed-remounts-for-node-detail-lanes.md)
- [Remove Mocks After Node Migration](./rules/nodes/remove-mocks-after-node-migration.md)
- [Use Generated Insert Payloads for Node Inserts](./rules/nodes/use-generated-insert-payloads-for-node-inserts.md)

## Security

- [Use AccessControl Hooks for Permission Decisions](./rules/security/use-access-control-hooks-for-permission-decisions.md)
- [OWASP A01: No UI-Only Authorization](./rules/security/owasp-a01-no-ui-only-authorization.md)
- [Guard Project Team Mutations With Owner Rights](./rules/security/guard-project-team-mutations-with-owner-rights.md)
- [Guard Topic Mutations With Topic Rights](./rules/security/guard-topic-mutations-with-topic-rights.md)
- [OWASP A02: Avoid Sensitive Data Exposure in Storage, Logs, and Transport](./rules/security/owasp-a02-avoid-sensitive-data-exposure-in-storage-logs-and-transport.md)
- [OWASP A03: Avoid Injection and Unsafe HTML Rendering](./rules/security/owasp-a03-avoid-injection-and-unsafe-html-rendering.md)
- [OWASP A04: Design Security-Sensitive Flows for Abuse Cases](./rules/security/owasp-a04-design-security-sensitive-flows-for-abuse-cases.md)
- [OWASP A05: Secure Frontend Configuration, Links, and Redirects](./rules/security/owasp-a05-secure-frontend-configuration-links-and-redirects.md)
- [OWASP A06: Audit Vulnerable and Outdated Components](./rules/security/owasp-a06-audit-vulnerable-and-outdated-components.md)
- [OWASP A07: Protect Authentication and Session Flows](./rules/security/owasp-a07-protect-authentication-and-session-flows.md)
- [OWASP A08: Protect Software and Data Integrity](./rules/security/owasp-a08-protect-software-and-data-integrity.md)
- [OWASP A09: Avoid Security-Blind Logging and Monitoring Gaps](./rules/security/owasp-a09-avoid-security-blind-logging-and-monitoring-gaps.md)
- [OWASP A10: Fail Closed on Security-Relevant Errors](./rules/security/owasp-a10-fail-closed-on-security-relevant-errors.md)

## a11y

- [Make Interactions Keyboard Accessible](./rules/a11y/make-interactions-keyboard-accessible.md)
- [Require Accessible Names for Icon-Only Actions](./rules/a11y/require-accessible-names-for-icon-only-actions.md)
- [Connect Form Controls to Labels and Errors](./rules/a11y/connect-form-controls-to-labels-and-errors.md)
- [No Manual ARIA on Radix Primitives](./rules/a11y/no-manual-aria-on-radix-primitives.md)

## i18n

- [Translate Inside Feature Components](./rules/i18n/translate-inside-feature-components.md)
- [Update Both Locale Files for New Translation Keys](./rules/i18n/update-both-locale-files-for-new-translation-keys.md)
- [Update English Locale When German Copy Changes](./rules/i18n/update-english-locale-when-german-copy-changes.md)
- [Use Correct German UI Copy](./rules/i18n/use-correct-german-ui-copy.md)

## Forms

- [Use TanStack Forms](./rules/forms/use-tanstack-forms.md)
- [Co-Locate Form Schemas with Feature Forms](./rules/forms/co-locate-form-schemas-with-feature-forms.md)

## Agent Behavior

- [Enumerate Review Findings By Severity](./behavior/enumerate-review-findings-by-severity.md)
- [Require Approval Before Git Publish](./behavior/require-approval-before-git-publish.md)
