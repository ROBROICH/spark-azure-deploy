---
name: fe-lint-fixer
description: |
  Scoped frontend check-fixing workflow for this package. Use when the user wants lint issues, test failures, type-check failures, or any failing `pnpm run check` branch fixed for a specific folder, a diff against dev, uncommitted files, or the whole project. The skill runs the repo check flow in-scope, applies autofixes first, fixes remaining in-scope failures, and re-checks before finishing.
---

# Frontend Check Fixer

Fix linting issues, test failures, type-check failures, and other in-scope `pnpm run check` failures for this frontend package within a user-approved scope only.

## Read First

- `.agents/CODE-STANDARDS.md`
- `.agents/skills/fe-code-review/topics/linting.md` for baseline lint review mechanics
- Start with these clean-code rules when suppressions or memoization are present:
  - `.agents/rules/clean-code/comments-jsdoc-suppressions.md`
  - `.agents/rules/clean-code/async-performance.md`
- Load `.agents/rules/clean-code/types-imports-exports.md` for TypeScript nullability, strict indexed-access, non-null assertions, casts, import/export shape, and type-shape failures.
- Load the owning rule file for every remaining scoped ESLint finding after autofix. Use `.agents/CODE-STANDARDS.md` as the rule-folder index; lint findings can be owned by `.agents/rules/clean-code/` or by domain folders such as i18n, a11y, security, API integration, forms, or nodes.

Treat `.agents/rules/**` as the source of truth for manual lint fixes after autofix. Use `.agents/rules/clean-code/` for generic maintainability/lint-shape patterns and the specific owning domain rule for domain-specific warnings.

## Non-Negotiable Rules

- Never widen the work beyond the chosen scope.
- If the user does not provide a scope, default to `all project`.
- Allowed scopes are:
  - specific folder
  - diff against `dev`
  - uncommitted files
  - all project
- If a necessary fix would require editing files outside the selected scope, stop and ask the developer.
- If a warning needs a product or architectural decision, stop and ask the developer instead of guessing.
- Autofixable ESLint errors should be cleared first. Manual work is for every remaining in-scope ESLint finding, using the owning rule folder to choose the correct fix.
- After every fixing ESLint run, always run Prettier on the same scope before verifying. `eslint --fix` does not reliably preserve project formatting.
- After scoped Prettier and ESLint verification, always run `pnpm run type-check` before finishing.
- Treat type-check failures caused by in-scope files as fix work, not just verification output.
- Treat test failures caused by in-scope files as fix work, not just verification output.
- For `all project`, treat any failing branch of `pnpm run check` and any remaining ESLint warning or error as fix work. Do not finish until `pnpm run check` passes, the follow-up `pnpm exec eslint .` has no warnings or errors, or a concrete decision blocker remains.
- Because `type-check` is repo-wide, only fix failures caused by in-scope files unless the developer expands scope.
- Because full test and check runs can surface out-of-scope failures for narrow scopes, only fix failures caused by in-scope files unless the developer expands scope.
- When the remaining warnings break into independent clusters with disjoint write scopes, use parallel sub-agents to fix those clusters.
- Keep smaller fixes local in the coordinator session while larger independent clusters run in parallel.

## Scope Detection

If `$ARGUMENTS` already makes the scope clear, use it. Otherwise default to `all project`.

Ask only when the user implies a narrower scope but does not make it concrete enough to resolve safely.

When interactive choice tools are available, present these options in that order:

- `Specific folder`
- `Diff against dev`
- `Uncommitted files`
- `All project`

If the user selects `Specific folder`, ask for the repo-relative folder path.

## Scope File Set

Build the TypeScript file set first. If the scope resolves to zero `ts`/`tsx` files, report that and stop.

### Specific folder

- Command: `rg --files <folder> -g '*.ts' -g '*.tsx'`

### Diff against dev

- Command: `git diff dev...HEAD --name-only -- '*.ts' '*.tsx'`

### Uncommitted files

- Commands:
  - `git diff HEAD --name-only -- '*.ts' '*.tsx'`
  - `git ls-files --others --exclude-standard -- '*.ts' '*.tsx'`

### All project

- Command: `rg --files . -g '*.ts' -g '*.tsx'`

## Fix Workflow

1. Resolve the scope and concrete file list.
2. Read the rule files implicated by the scoped lint output and obvious code signals, including non-linting topic folders when they own the warning.
3. Run the check flow for that scope.
4. Apply autofixes first.
5. Inspect the remaining in-scope lint findings.
6. Group the remaining warnings into independent clusters by file set, feature area, or refactor theme.
7. Spawn sub-agents for large clusters when their write scopes do not overlap.
8. Keep smaller or tightly coupled fixes local in the coordinator session.
9. Fix all remaining in-scope ESLint issues that can be resolved without developer input, following the owning rule file.
10. Run `pnpm run type-check`.
11. If `type-check` fails because of in-scope files, fix those failures without widening scope. Re-run scoped Prettier and ESLint on any files changed while fixing type errors.
12. Run the relevant tests for in-scope failures. For `all project`, this is `pnpm run check`; for narrow scopes, run the failing test files or the closest scoped Vitest command first.
13. If tests fail because of in-scope files, fix those failures without widening scope. Re-run scoped Prettier, ESLint, type-check, and the relevant tests on any files changed while fixing tests.
14. Re-run the same scoped check flow. For `all project`, finish with `pnpm run check`.
15. Run `pnpm run type-check` again unless the final `pnpm run check` already passed in the same verification pass.
16. Confirm whether the selected scope is clean for all ESLint issues, whether type-check passes, and whether tests / `pnpm run check` pass for the in-scope changes.

## Commands

### All project

Use the repo command directly:

```bash
pnpm run check
```

`pnpm run check` already includes `pnpm run type-check`.

Then run:

```bash
pnpm exec prettier --write .
pnpm exec eslint .
```

Use the lint output for verification and remaining manual fixes. Fix all remaining ESLint warnings and errors that have an in-scope fix path, even when `pnpm run check` exits successfully with warnings.
If `pnpm run check` reports lint, test, type-check, or other check failures in in-scope files, or if the follow-up ESLint run reports warnings in in-scope files, fix those files, then re-run `pnpm exec prettier --write .`, `pnpm exec eslint .`, `pnpm run type-check`, and finally `pnpm run check`.

### Narrow scopes

Do not run repo-wide `pnpm run check`, because it would edit files outside scope. Reproduce the same mutating behavior only for the scoped file list, then run repo-wide type-check and fix only the failures caused by in-scope files:

#### Specific folder

```bash
FILES=($(rg --files <folder> -g '*.ts' -g '*.tsx'))
pnpm exec eslint --fix "${FILES[@]}"
pnpm exec prettier --write "${FILES[@]}"
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
```

If `pnpm run type-check` or relevant tests fail because of files inside `<folder>`, fix those files and then re-run:

```bash
pnpm exec prettier --write "${FILES[@]}"
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
pnpm exec vitest run <failing-test-files>
```

#### Diff against dev

```bash
FILES=($(git diff dev...HEAD --name-only -- '*.ts' '*.tsx'))
pnpm exec eslint --fix "${FILES[@]}"
pnpm exec prettier --write "${FILES[@]}"
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
```

If `pnpm run type-check` or relevant tests fail because of files inside `FILES`, fix those files and then re-run:

```bash
pnpm exec prettier --write "${FILES[@]}"
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
pnpm exec vitest run <failing-test-files>
```

#### Uncommitted files

```bash
FILES=(
  $(git diff HEAD --name-only -- '*.ts' '*.tsx')
  $(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')
)
pnpm exec eslint --fix "${FILES[@]}"
pnpm exec prettier --write "${FILES[@]}"
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
```

If `pnpm run type-check` or relevant tests fail because of files inside `FILES`, fix those files and then re-run:

```bash
pnpm exec prettier --write "${FILES[@]}"
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
pnpm exec vitest run <failing-test-files>
```

If the scoped file list is empty, stop before running Prettier, ESLint, or type-check. If the file list is long, chunk it safely without widening the scope.

## Type-Check Failure Indexing

When `pnpm run type-check` produces many failures, index the failures before editing:

```bash
pnpm exec tsc --noEmit --pretty false --incremental false
```

Use the output to group failures by file, error code, and fix pattern. For temporary notes or generated summaries, write outside the repo such as `/private/tmp`; do not add tracked reports unless the user asks.

For `noUncheckedIndexedAccess`-driven failures such as `TS2532`, `TS18048`, `TS2345`, `TS2322`, `TS2538`, and `TS2488`, load `.agents/rules/clean-code/types-imports-exports.md` and apply its strict indexed-access decision tree. Do not solve these by adding postfix `!`, broad casts, or a codebase-wide array helper by default.

## Parallel Cluster Strategy

After autofix, look at the remaining scoped warnings and decide whether they fall into independent clusters.

Good clustering signals:

- one feature folder with many warnings that do not touch other folders
- one large file or one pair of related files that need structural refactoring
- one repeated warning type across a small set of files with a shared fix pattern

Use sub-agents when:

- the cluster is large enough to block progress if handled serially
- the files owned by that cluster do not overlap with another cluster
- the next local step does not depend on that cluster finishing first

Keep work local when:

- the remaining fixes are small
- the warnings are tightly coupled across the same files
- the fix requires continuous judgment across the whole scoped slice

When spawning sub-agents:

- assign each sub-agent a concrete file set or cluster
- tell each sub-agent that it must stay inside the chosen scope
- tell each sub-agent that it is not alone in the codebase and must not revert others' edits
- reserve shared files for only one worker at a time

## What to Fix Manually

After autofix, work through all remaining in-scope ESLint findings that map to `.agents/rules/**`. First load the specific owning rule file, then apply the smallest safe fix.

Generic linting-topic findings include:

- oversized files and functions
- forward references / define-before-use issues
- console usage
- serial `await` in loops
- non-null assertions
- deep nesting
- suppression hygiene
- JSDoc lint findings
- components defined during render

Topic-owned lint findings must also be fixed when safely decidable. Common examples include:

- `useState` warnings: load `.agents/rules/clean-code/state-effects-routing.md` and either move URL-worthy state into TanStack Router or add a narrow justified suppression when the state is truly ephemeral UI state.
- Router search warnings: load `.agents/rules/clean-code/state-effects-routing.md`.
- Accessibility warnings: load the relevant `.agents/rules/a11y/` file.
- i18n warnings: load the relevant `.agents/rules/i18n/` file.
- Security warnings: load the relevant `.agents/rules/security/` file and stop if intended behavior is unclear.

Do not limit manual cleanup to `.agents/rules/clean-code/`. The goal is a warning-free scoped ESLint run unless a decision blocker remains.

Also fix in-scope type-check failures that can be resolved safely without widening scope, such as:

- missing imports or exports
- stale renamed symbols
- incorrect argument or return types introduced by in-scope edits
- generic constraints or nullability issues in in-scope files
- strict indexed-access failures from arrays, maps, regex matches, `.split()`, mock calls, route/search values, and lookup tables; classify each as invariant, real missing data, fallback, parser boundary, or test-only access before editing

Also fix in-scope test failures that can be resolved safely without widening scope, such as:

- stale assertions after intentional behavior changes
- missing test environment shims for browser APIs used by in-scope UI
- mocks that no longer match in-scope imports or generated client signatures
- test fixtures that no longer satisfy in-scope node/API/domain types
- regressions in in-scope code surfaced by tests

## Decision Breaks

Stop and ask the developer when:

- fixing the warning would require changing behavior and there is more than one reasonable option
- the clean fix crosses the selected scope boundary
- the best fix is unclear between refactor, suppression, or exception
- the owning rule file cannot be identified from `.agents/CODE-STANDARDS.md` and the lint output
- a warning appears to reflect intentional product behavior rather than code quality debt
- the type-check failure can only be fixed by changing out-of-scope files
- the test failure can only be fixed by changing out-of-scope files or by deciding intended product behavior

Use a short, concrete question that names the file, the warning or type error, and the decision needed.

## Completion

Only finish when one of these is true:

- the scoped re-check shows no remaining in-scope ESLint warnings or errors, `pnpm run type-check` passes, and relevant tests pass
- for `all project`, `pnpm run check` passes and the follow-up `pnpm exec eslint .` reports no warnings or errors
- you are blocked on a developer decision and have explicitly asked for it
- you found remaining in-scope issues, in-scope type-check failures, or in-scope test failures that cannot be fixed safely, and you listed them clearly
- `pnpm run type-check` or tests fail only for out-of-scope files, and you listed those failures clearly without widening the fix scope

The final response must state:

- the scope used
- whether autofix was run
- whether the scoped re-check passed
- whether `pnpm run type-check` passed
- whether tests / `pnpm run check` passed
- whether in-scope type-check issues were fixed
- whether in-scope test issues were fixed
- any remaining in-scope issues or decision blockers
