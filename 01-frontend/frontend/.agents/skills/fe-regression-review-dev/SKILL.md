---
name: fe-regression-review-dev
description: |
  Regression-focused frontend review against the current branch diff versus `dev`.
  Use when the user asks whether this branch introduces regressions, asks if a PR is only a horizontal code-quality cleanup, wants confirmation that a bug is new on this branch versus already present on `dev`, or wants a `dev...HEAD` review limited to non-test `.ts` and `.tsx` files.
---

# FE Regression Review Against Dev

Review the current branch against `dev` for regressions in runtime source code only.

## Scope

- Review only files from `git diff --name-only dev...HEAD` that match `*.ts` or `*.tsx`.
- Exclude all test-like files:
  - `*.test.ts`
  - `*.test.tsx`
  - `*.spec.ts`
  - `*.spec.tsx`
  - `*.stories.tsx`
  - `*.d.ts`
- Restrict the review to runtime source code only. Do not inspect or discuss non-TypeScript files.
- Do not inspect test files and do not report missing or weak tests in this skill.
- Prefer `src/**` runtime source files.

## Core Rule

Do not report a finding as a regression until you verify it is introduced by `HEAD` relative to `dev`.

For every candidate issue:

1. Read the branch diff in the changed source file.
2. Read the `dev` version of the same file with `git show dev:<path>`.
3. Confirm the bad behavior is new on this branch.
4. If the same problem already exists on `dev`, do not call it a regression.

## Workflow

1. Resolve the baseline:
   - Prefer local `dev`.
   - If local `dev` is missing, use `origin/dev` and say so explicitly.
2. Collect changed runtime source files:
   - `git diff --name-only dev...HEAD`
   - Filter with `rg '\.(ts|tsx)$'`
   - Exclude with `rg -v '\.(test|spec|stories)\.tsx?$|\.d\.ts$'`
   - Filter to non-test `.ts` and `.tsx` files only.
3. Read the full diff for those files:
   - `git diff dev...HEAD -- <filtered-files>`
4. Review for regressions only.
5. For each suspected regression, compare the affected code to `dev`.
6. Classify the branch as one of:
   - `regression-free horizontal improvement`
   - `mostly horizontal, but with regressions`
   - `behavior-changing feature/fix work`

## What Counts As A Regression

Read [references/regression-taxonomy.md](./references/regression-taxonomy.md) before reviewing. Use that file as the definition of a regression.

In short, a regression is a behavior, compatibility, reliability, security, accessibility, or performance outcome that worked on `dev` and is now worse on the current branch.

## React Compiler Note

This frontend package has React Compiler enabled.

- Do not treat the removal of manual memoization (`useMemo`, `useCallback`, or similar wrapper refactors) as a confirmed regression by itself.
- Do not infer a performance regression from removed manual memoization alone.
- Only report a performance regression when you can show concrete branch-only evidence that runtime behavior is worse than `dev`.
- If the only concern is that `dev` used manual memoization and `HEAD` does not, treat that as insufficient evidence.

## What Does Not Count

- Existing bugs already present on `dev`
- Pure code movement or refactors with preserved behavior
- Style-only or naming-only changes
- Manual memoization removals that lack concrete branch-only runtime impact
- Test-only failures without runtime impact
- Intentional product changes that do not break previous supported behavior

## Output Requirements

Present findings first, ordered by severity.

For each finding include:

- Severity: `critical`, `major`, or `minor`
- Why it is a regression versus `dev`
- User-facing impact
- File and line references in `HEAD`
- The `dev` baseline comparison you used

After findings, include:

- `Open questions / assumptions`
- `Classification`
  - Say clearly whether this is a horizontal code quality PR or not
- `Files reviewed`

If there are no regressions, say that explicitly and still provide the final classification.
