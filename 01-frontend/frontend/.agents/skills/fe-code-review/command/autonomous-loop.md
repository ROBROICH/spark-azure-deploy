# Autonomous Loop — Uninterrupted review and fix execution

Runs review or fix work without interactive menus or per-item confirmation.

## Purpose

Use this workflow when the agent should keep working through review or fix todos until it reaches a clear stopping condition.

This workflow is intentionally non-interactive:

- do not open menus
- do not ask per-finding follow-up questions
- do not stop after each item
- only stop when the todo list is empty, required input is missing, or `--max-iterations` is reached

## Arguments

`$ARGUMENTS` may include one of these modes:

- `review <SCOPE|FEATURE_FOLDER|PR_URL> [--topics topic1,topic2,...] [--continue-to-fix] [--max-iterations N]`
- `fix <REVIEW_ID> [--severity critical,major] [--topic topic1,topic2,...] [--verification full|checks|tests|skip] [--max-iterations N]`

### Common Rules

- Require explicit mode: `review` or `fix`
- In `review` mode, require explicit scope, feature-folder path, or PR URL; do not ask for it interactively
- In `fix` mode, require explicit `REVIEW_ID`
- Default `--max-iterations`:
  - `review`: number of applicable review batches + `2`
  - `fix`: number of findings with `Status: fix` + `5`
- If required input is missing, stop immediately and ask the user once

## Todo Sources

### Review mode todos

A review todo is any applicable topic batch that does not yet have a completed `review-*.md` file for the current review input.

For big feature-folder reviews, a topic batch means one `<topic, partition>` pair.

Treat a topic batch as still pending when:

- the expected review file does not exist
- the topic file exists but is clearly stale compared with the current review input
- the merged review has not yet been regenerated after topic reviews completed

### Fix mode todos

A fix todo is any finding in `.code-review-reports/<REVIEW_ID>/review-merged.md` with:

- `**Status**: fix`

Ignore findings marked:

- `discuss`
- `ignore`
- `fixed`

## Mode 1: Autonomous Review

Use this mode to finish the full review pass without stopping for triage.

### Steps

1. Use the explicit scope, feature-folder path, or PR URL from `$ARGUMENTS`
2. Run the review workflow from `command/code-review.md` through merge creation
   - Feature-folder inputs use the same partitioning rules from `command/code-review.md`
3. Auto-triage findings:
   - `Needs Discussion: no` → `fix`
   - `Needs Discussion: yes` → `discuss`
4. Save the triaged `.code-review-reports/<ID>/review-merged.md`
5. If `--continue-to-fix` is present, immediately switch to `fix` mode for the same review ID
6. Otherwise stop after printing the merged summary and remaining `fix`/`discuss` counts

### Output Summary

After review mode, print:

```text
Autonomous review complete.
Review ID: <ID>
Topics reviewed: <N>
Fix findings: <N>
Discuss findings: <N>
Ignored findings: <N>
```

## Mode 2: Autonomous Fix

Use this mode to work through fixable findings until none remain.

Before editing, follow the parallel fix worker eligibility policy in `command/fix-review.md`: spawn workers only for isolated findings or isolated finding groups with low or no touched-file overlap, and keep overlapping, uncertain, lint-bucket, formatter, and shared review-file updates in the coordinator loop.

### Steps

1. Read `.code-review-reports/<REVIEW_ID>/review-merged.md`
2. Build the todo list from findings marked `Status: fix`
3. Apply `--severity` and `--topic` filters if provided
4. Process one finding at a time:
   - read the finding details
   - read the real source file
   - implement the fix
   - add or update tests when the finding requires it
   - update the finding to `Status: fixed`
   - add `**Resolution**: ...`
5. Re-scan the review file after each fix in case new `fix` findings were added during the run
6. Stop when no `Status: fix` findings remain or `--max-iterations` is reached
7. Run auto-format
8. Run verification according to `--verification`

### Verification Defaults

If `--verification` is omitted:

- default to `full`

Verification modes:

- `full` → `pnpm test`, `pnpm type-check`, `pnpm lint`
- `checks` → `pnpm type-check`, `pnpm lint`
- `tests` → `pnpm test`
- `skip` → no verification

## Stop Conditions

Stop the loop when any of these is true:

- no review todos remain
- no fix todos remain
- required input is missing
- a blocking error prevents further progress
- `--max-iterations` is reached

When stopping because of a blocking error or iteration cap, print what remains.

## Final Output

### Review mode

```text
Autonomous review finished.
Remaining fix findings: <N>
Remaining discuss findings: <N>
Next recommended action: autonomous-loop fix <ID> | manual discussion
```

### Fix mode

```text
Autonomous fix finished.
Fixed findings: <N>
Remaining fix findings: <N>
Remaining discuss findings: <N>
Verification: full|checks|tests|skip
```

## Important Constraints

- Never auto-fix findings marked `discuss` or `ignore`
- Never silently drop a failed finding; leave it in the review file if it could not be resolved
- Prefer resuming from the review file state instead of recomputing decisions
- Keep the merged review file as the source of truth for loop state
