# Comments, JSDoc, and Suppressions

Use when code changes comments, TODOs, JSDoc, lint disables, TypeScript suppressions, or AI-looking explanation blocks.

## Rules

- Comments must explain intent, constraints, invariants, side effects, or non-obvious behavior. Remove comments/JSDoc that only restate code, property names, obvious helper behavior, or a schema field one-for-one.
- Code comments, JSDoc, and rationale notes must be English. Keep established domain terms in their original wording when needed, but explain around them in English. User-facing translation content is the exception.
- `TODO`, `FIXME`, and similar task tags need an owner/ticket or exit condition plus why the work is deferred. Remove stale or non-actionable task comments when touching nearby code.
- Add JSDoc only when the dedicated JSDoc ESLint config or complexity/recursion rules require it, or when a non-obvious public/helper contract genuinely needs explanation. Do not add obvious JSDoc to satisfy perceived review expectations.
- Required or existing JSDoc must be complete and current: document each parameter and return behavior, focus on intent/invariants/side effects rather than TypeScript types, and update or remove stale blocks when signatures change.
- Do not leave `console.log`, `console.warn`, `console.error`, or similar runtime debug calls in feature code, route code, hooks, or shared runtime logic. Prefer user-visible error handling, structured monitoring, or explicit return values; local scripts and short-lived debugging are exceptions.
- Use `eslint-disable-next-line`, `@ts-expect-error`, and similar escapes only when a local refactor is not better. Scope to the smallest rule/line and include a concrete reason, not `temporary`, `needed`, or `TODO`.
- Remove suppressions that are unused or obsolete because config overrides changed. Treat stale suppressions as the finding when the underlying code is now allowed.

## Report When

Report AI-style narration, obvious JSDoc, mixed-language code comments, bare TODOs, runtime console residue, broad suppressions, unexplained TypeScript escapes, stale disables, or comment blocks that make the file look reviewed without encoding real knowledge.

## Human Triage Suggestion

Suggest deleting the noise, replacing it with one invariant comment, adding a ticketed exit condition, completing required JSDoc, or narrowing/removing the suppression.
