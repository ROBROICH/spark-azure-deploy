# Fix Review — Work through review findings

Reads a triaged review file and fixes all findings marked with `Status: fix`.

For unattended execution without interactive pauses, use the `autonomous-loop` workflow in `fix` mode instead of this document.

## Arguments

`$ARGUMENTS` may include: `<REVIEW_ID> [--ralph] [--severity critical,major] [--topic state-effects-routing,components-jsx,nodes,linting,...]`

- **REVIEW_ID** (required): The review ID (`local-uncommitted`, `branch-<branch>`, or `pr-<branch-or-number>`). Points to `.code-review-reports/<REVIEW_ID>/review-merged.md`.
- **--ralph**: Start a Ralph loop instead of fixing in this session. Useful for autonomous iteration.
- **--severity**: Only fix findings of the specified severity levels. Default: all.
- **--topic**: Only fix findings from the specified topics. Default: all.

## Pre-Fix: Ask About Test Verification

Before starting fixes, ask:

**Question**: "Should I run verification after all fixes are applied? (Recommended for changes touching multiple files)"

**Options**:

- **Frontend tests only** — Run `pnpm test` after fixing
- **Frontend checks only** — Run `pnpm type-check` and `pnpm lint` after fixing
- **Full frontend verification** — Run `pnpm test`, `pnpm type-check`, and `pnpm lint`
- **Skip verification** — Don't run tests or checks

Store the answer as `verification_mode` for use in the Verification phase.

## Mode 1: Direct Fix (default)

1. Read `.code-review-reports/<REVIEW_ID>/review-merged.md`
2. Parse all findings with `**Status**: fix`
3. Filter by `--severity` and `--topic` if specified
4. Create a work list for each finding
5. Work through them one by one:
   a. Read the finding details
   b. Read the actual source file
   c. Implement the suggested fix (or a better fix if the suggestion is wrong)
   d. Update the finding status in the review file from `fix` to `fixed`
   e. Mark the task as completed
6. After all findings are processed, print a summary
7. Proceed to the **Auto-Format** phase (always runs)
8. If `verification_mode` is not "Skip verification", proceed to the **Verification** phase

## Mode 2: Ralph Loop (--ralph)

If `--ralph` is passed, instead of fixing directly, output instructions for the user to start an autonomous Ralph loop:

```
To start autonomous fixing, use this loop prompt with your iteration tool:

"Read .code-review-reports/<REVIEW_ID>/review-merged.md. Find the NEXT finding with Status: fix (not fixed, not discuss, not ignore). Read the source file mentioned in the finding. Implement the fix. If the finding is a bug fix or a testing finding (DR-TEST-*), also add or update a test to cover the fix — verify the test has meaningful assertions (specific values, behavioral checks), not just render/call-without-crash checks. Update the finding status from 'fix' to 'fixed' in review-merged.md. Then report what you fixed and whether test coverage was added."
```

Where supported, set the maximum iteration count to the number of findings with status `fix` plus a small buffer (for example, `+5`).

IMPORTANT: Do NOT actually start the Ralph loop from this workflow. Just print the prompt and any suggested loop settings, because the autonomous loop should be started separately.

After the Ralph loop finishes, remind the user to run the Auto-Format and Verification phases manually:

```
After Ralph finishes, run auto-format and verification:
  pnpm check
  pnpm test
  pnpm type-check
  pnpm lint
```

## Handling Findings

### For each finding:

1. Read the finding from the review file
2. Locate the file and line mentioned
3. Read surrounding context (at least 50 lines around the mentioned line)
4. Implement the fix:
   - If the suggested fix is a code snippet, apply it (but verify it's correct first)
   - If the suggestion is conceptual, implement the appropriate code change
   - If the fix requires changes to multiple files, make all necessary changes
5. After fixing, update the review file:
   - Change `**Status**: fix` to `**Status**: fixed`
   - Add a line: `**Resolution**: <brief description of what was changed>`

### Linting bucket findings

Linting findings in the review phase may be aggregated into the buckets `Autofixable lint findings` and `Lint findings fixable with AI help` instead of being enumerated one by one.

When fixing one of those linting buckets:

1. Reconstruct the original review scope from the review ID and changed-files list
2. Build the in-scope `ts` / `tsx` file list for that review scope
3. Run scoped `pnpm exec eslint --fix` on that file list
4. Always run scoped `pnpm exec prettier --write` on the same file list immediately afterwards
5. Re-run scoped `pnpm exec eslint` on the same file list
6. Fix the remaining in-scope lint warnings with AI help until the bucket is resolved or blocked by a developer decision

Treat a linting bucket as permission to clean the full in-scope lint backlog for that reviewed scope. Do not widen beyond the original review scope.

### For discussion findings (don't fix, just report):

If you encounter a finding with `**Status**: discuss`, skip it and print:

```
⏭️ Skipping DR-<ID>: <title> (marked for discussion)
```

### For ignored findings:

If you encounter a finding with `**Status**: ignore`, skip silently.

## Final Summary

After processing all findings:

```markdown
## Fix Summary

| Finding      | Status     | Resolution                                                       |
| ------------ | ---------- | ---------------------------------------------------------------- |
| DR-STATE-001 | ✅ fixed   | Moved URL-worthy filter state into TanStack Router search params |
| DR-TYPE-003  | ✅ fixed   | Replaced `interface` with `type` and removed a barrel import     |
| DR-SEC-001   | 💬 discuss | Needs decision on auth strategy                                  |
| DR-API-002   | ⏭️ ignore  | Intentional design choice                                        |

Fixed: N / Total: M
Remaining for discussion: K
```

## Post-Fix Test Coverage Audit

After all findings are processed, verify that fixes which _should_ have included test changes actually did. This step runs regardless of `verification_mode`.

### Step 1: Identify findings that require test coverage

Scan all findings that were just fixed (`**Status**: fixed`) and flag any that fall into these categories:

- **Test-quality findings** (prefix `DR-TEST-*`): These explicitly asked for missing or improved tests — the fix MUST have added/modified test files
- **Bug fix findings** (any topic): If the finding described a bug and the fix changed production code, there should be a regression test
- **New behavior findings**: If the fix introduced new branching logic, error handling, or validation, test coverage should accompany it

### Step 2: Check what was actually changed

For each flagged finding, inspect the fix:

1. Read the `**Resolution**` line to understand what was done
2. Use `git diff --name-only` to see which files were modified since the fix session started
3. Determine if any test files (`.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`) were added or modified

### Step 3: Report coverage gaps

If a finding required test coverage but no test files were touched:

1. **Do NOT silently pass** — create a new finding in the review file:

   ```markdown
   ## Finding DR-TEST-POST-<NNN>: Missing test coverage for fix DR-<original-ID>

   - **Severity**: major
   - **Confidence**: 90
   - **Needs Discussion**: no
   - **File**: <the file that was fixed>
   - **Issue**: Fix for "<original finding title>" changed production code but did not add or update any tests. The fix should include a regression test to prevent this issue from recurring.
   - **Suggested Fix**: Add a test in <expected test file location> that covers the fixed behavior.
   - **Status**: fix
   ```

2. Work through these new test-coverage findings immediately (same loop as Mode 1 step 5)
3. After resolving, append to the fix summary table with a `🧪` marker:
   ```
   | DR-TEST-POST-001 | 🧪 added | Regression test for DR-FE-003 fix |
   ```

### Step 4: Verify test meaningfulness

For test files that WERE added or modified as part of fixes, do a quick assertion-depth check:

- Does the test assert specific expected values (not just truthiness)?
- Does it test the actual behavior that was fixed (not just that the code runs)?
- For bug fixes: would the test have FAILED before the fix was applied?

If a test is too shallow, fix it inline before proceeding to the Verification phase.

## Auto-Format Phase

**Always run this phase after fixing**, regardless of `verification_mode`. AI-generated fixes often don't match the project's exact formatting conventions. Auto-formatting is non-destructive and ensures the codebase stays clean.

Determine which formatters to run based on the files changed during fixing (use `git diff --name-only` to check):

### Frontend code files changed (`src/**`)

Run:

1. `pnpm check` — apply the project's formatting and lint auto-fixes
2. `pnpm exec prettier --write <changed-frontend-files>` — always run Prettier again after the fixing lint pass because `eslint --fix` can leave formatting that does not match Prettier

If any formatter fails (not just style warnings, but actual errors), report the failure and continue to the Verification phase — do not attempt to manually fix formatter errors.

## Verification Phase (Post-Fix Testing)

**Skip this phase if `verification_mode` is "Skip verification".**

After auto-formatting is complete, run the appropriate tests and checks based on `verification_mode`:

### Step 1: Run Tests

Based on the user selection:

- **Frontend tests only**: `pnpm test`
- **Frontend checks only**: `pnpm type-check` and `pnpm lint`
- **Full frontend verification**: `pnpm test`, then `pnpm type-check`, then `pnpm lint`

### Step 2: Run Lint and Type Checks

If `verification_mode` includes checks, verify that typing and linting are clean:

- `pnpm type-check`
- `pnpm lint`

### Step 3: Handle Failures

If all checks pass: Print "All checks passed." and finish.

If tests fail:

1. Analyze the failure output to identify which tests failed and why
2. Determine if the failure is caused by one of the fixes we applied
3. If yes, attempt to fix the test failure (max 3 attempts total across all failures)
4. Re-run only the failing tests to verify the fix
5. If still failing after 3 attempts, stop and report:

```
⚠️ Test failures could not be auto-resolved:

- <test name>: <brief failure description>
- <test name>: <brief failure description>

Please review these failures manually.
```

If lint/format checks fail (after auto-format already ran): Report them as warnings — these likely indicate a formatter configuration issue rather than a code issue.

### Step 4: Final Verification Summary

Append to the fix summary:

```markdown
## Verification

| Check          | Result                                  |
| -------------- | --------------------------------------- |
| `pnpm check`   | ✅ clean / ⚠️ updated files / ❌ failed |
| Frontend tests | ✅ passed / ❌ N failures / ⏭️ skipped  |
| TypeScript     | ✅ passed / ❌ N errors / ⏭️ skipped    |
| Lint           | ✅ passed / ⚠️ N warnings / ⏭️ skipped  |
```
