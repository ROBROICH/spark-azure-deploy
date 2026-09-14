---
name: fe-code-review
description: |
  Deep, topic-isolated review for this frontend codebase.
  Use for local changes, branch diffs, feature folders, or merge requests.
  Runs REVIEW, TRIAGE, then optional FIX with stable severity IDs.
  Prefer Codex multi-agents when available; otherwise use native sub-agents or disclose a serial downgrade.
  Domain topics map to `.agents/rules/<topic>/`; clean-code topics map to individual `.agents/rules/clean-code/*.md` files.
  Linting must run scoped ESLint plus `pnpm run type-check`.
---

# Deep Review Skill

Topic-isolated, parallel code review with structured triage and automated fixing.

## Non-Negotiable Execution Rules

- The coordinator session is for scope detection, orchestration, aggregation, triage, and fix coordination only.
- Do not perform the substantive review in the coordinator session when parallel execution is available.
- A valid run of this skill must produce topic-isolated review outputs for every applicable topic, even when a topic has no findings.
- If the required orchestration path cannot be executed, say so explicitly before continuing and explain the downgrade.
- The `linting` topic is command-driven: it must run a scoped ESLint check, run `pnpm run type-check`, and then review relevant lint and type-check failures against the owning `.agents/rules/clean-code/*.md` file plus the domain rule folder when the warning is domain-specific.
- The `nodes` topic must run whenever the reviewed code uses the nodes graph surface, including `useNode`, `useNodes`, `useGraph`, `useDescendants`, `NodePayloadByType`, or `NodeRef`.
- The coordinator's final merged findings list MUST enumerate every finding with a severity-prefixed stable ID such as `H1`, `H2`, `M1`, `L1`.
- Numbering MUST reset within each severity band for each review run, and those IDs MUST be the identifiers used in triage and fix selection.

## Important: Before Starting

This skill MUST first determine the review iteration count, then ask the user what scope to review, unless those are already clear from `$ARGUMENTS`.

### Iteration Selection Rules

1. If `$ARGUMENTS` contains `--iterations <N>` or `iterations <N>` → skip asking and use that value
2. Otherwise → ask the user how many review iterations they want
3. Default recommendation: `1`
4. Explicitly warn that higher counts burn substantially more tokens and runtime because each applicable slice is reviewed repeatedly

Suggested prompt shape:

```
Question: "How many review iterations should I run?"
Header: "Iterations"
Options:
  - label: "1", description: "Cheaper and faster. Good default for branch and PR reviews."
  - label: "2", description: "Runs each review slice twice and carries prior findings into the second pass. More thorough but burns significantly more tokens/time."
  - label: "3", description: "Most exhaustive, but burns substantially more tokens/time."
```

If the user gives a free-form number, accept it when it is a positive integer. If no iteration count is provided after asking, use `1`.

### Scope Selection Rules

1. If `$ARGUMENTS` contains a merge request URL → skip asking, use **Merge Request** scope
2. If `$ARGUMENTS` contains `local` or `uncommitted` → skip asking, use **Local Changes** scope
3. If `$ARGUMENTS` contains `branch` → skip asking, use **Branch Diff** scope
4. If `$ARGUMENTS` contains `feature-folder <path>` or a repo-relative directory path that exists → skip asking, use **Feature Folder** scope
5. Otherwise → use the `AskUserQuestion` tool to present an interactive scope selection menu:

```
Question: "What should I review?"
Header: "Review scope"
Options:
  - label: "Local changes", description: "Uncommitted changes only (staged + unstaged)"
  - label: "Branch diff", description: "All changes on this branch vs dev"
  - label: "Merge request", description: "Review the checked-out PR branch or ask for a merge request URL"
  - label: "Feature folder", description: "Review an existing feature folder directly"
```

If the user selects "Merge request", follow up by asking for the PR URL or confirm that the current branch already matches the PR branch.

If the user selects "Feature folder", ask for the repo-relative folder path to review. Prefer a folder under `src/features/`, but allow any existing folder inside this package.

### Review Input by Scope

| Scope          | File list command                 | Primary review input                    |
| -------------- | --------------------------------- | --------------------------------------- |
| Local changes  | `git diff HEAD --name-only`       | `git diff HEAD`                         |
| Branch diff    | `git diff dev...HEAD --name-only` | `git diff dev...HEAD`                   |
| Merge request   | `git diff dev...HEAD --name-only` | `git diff dev...HEAD`                   |
| Feature folder | `rg --files <folder>`             | Inspect files under `<folder>` directly |

### Command-Driven Checks

- The `linting` topic must always run the scoped ESLint command for the selected scope and `pnpm run type-check`.
- `pnpm run type-check` is repo-wide. For non-all-project scopes, treat failures caused by reviewed files as in-scope findings and report unrelated failures separately without widening the review scope.
- The linting artifact must record both the scoped ESLint result and the `pnpm run type-check` result, even when one of them is clean.
- When interpreting ESLint findings, respect later matching overrides in `eslint.config.js`. For rules such as `no-restricted-syntax`, override options replace the full earlier selector list rather than merging with it.
- Concretely, if a later file-pattern override omits the `useMemo` and `useCallback` selectors for `no-restricted-syntax`, do not report those hook usages as linting findings for matching files.
- Context providers are the main expected exception here: stable provider `value` objects and callbacks exposed through context can be legitimate identity boundaries even with React Compiler enabled.
- If a config override makes an inline `eslint-disable-next-line no-restricted-syntax` comment unnecessary, treat the stale suppression as the relevant linting issue instead of reporting the underlying hook usage.

### Review ID by Scope

| Scope          | Review ID (`<ID>`)                 |
| -------------- | ---------------------------------- |
| Local changes  | `local-uncommitted`                |
| Branch diff    | `branch-<branch-name>`             |
| Merge request   | `pr-<branch-name-or-number>`       |
| Feature folder | `feature-<normalized-folder-path>` |

## Phase Overview

## Required Preflight Checklist

Before Phase 1, the coordinator MUST complete and record this checklist:

1. Detect the current callee/runtime first.
2. If the callee is Codex, detect whether Codex multi-agents are available and use that path first when available.
3. If the preferred Codex multi-agent path is unavailable, detect whether native parallel sub-agents are available in the current runtime.
4. If no native parallel path is available, record an explicit serial downgrade before continuing.
5. Determine the applicable review topics for the selected scope.
6. Create one parallel review worker per review slice.
7. Define the output path `.code-review-reports/<ID>/review-*.md` for every planned slice.
8. Determine the review iteration count for each slice.

Do not start reviewing files until this checklist is complete.

### Phase 1: Review

Parallel background agents.

- Default: one agent per applicable topic
- Big feature-folder review: one agent per `<topic, immediate-child-directory>` pair
- Run each slice for `N` iterations, where `N=1` by default unless the user requested otherwise
- Each agent writes to `.code-review-reports/<ID>/review-*.md`
- Clean-code slices should load only their mapped clean-code rule file and any reference file named by that rule or topic prompt.
- Each `linting` slice records the scoped ESLint output and the `pnpm run type-check` result before judging findings.
- Each applicable topic must result in exactly one final status: `reviewed`, `skipped-with-reason`, or `failed`.

#### In-Scope vs Possibly Out of Scope

- Each agent may read surrounding files for context, but MUST separate findings into two buckets:
  - **In scope**: findings on lines that appear in the diff input.
  - **Possibly out of scope**: findings on lines NOT in the diff. These may still be worth knowing, but must be listed separately at the end of the agent's report under a `## Possibly out of scope` section.
- The coordinator must preserve this separation in the merged output and present possibly-out-of-scope findings in a distinct collapsed section after the main triage list.

### Multi-Iteration Review Protocol

- Iteration 1 reviews the slice normally and records findings.
- Iteration 2+ must receive the earlier findings for the same slice as explicit context.
- Later iterations must avoid merely restating the same issues. They should:
  - confirm earlier findings when still valid
  - look specifically for missed issues
  - add only net-new findings or stronger evidence for existing ones
- The coordinator must merge findings across iterations per slice into one final artifact.
- The merged artifact should preserve which findings were first surfaced in which iteration when helpful for traceability.
- If an iteration finds no new issues, it must still record that it reviewed the slice after considering prior findings.

### Codex Model Selection

- When the current callee/runtime is Codex, choose review-worker models by iteration:
  - If `N=1`, run that single iteration on the highest-capability Codex model available in the runtime.
  - If `N>=2`, run iteration 1 on the latest available Codex mini model, then run iteration 2 on the highest-capability Codex model available in the runtime.
  - If `N>2`, continue running iteration 3+ on the highest-capability Codex model available in the runtime unless the user explicitly asks for a different model mix.
- Apply this policy consistently across Codex multi-agents and native Codex sub-agents.
- If the intended model tier is unavailable in the current runtime, disclose the downgrade and use the closest available tier.

### Runtime-Specific Parallelism

- If the current callee is Codex and Codex multi-agents are available, use Codex multi-agents as the first-priority parallel orchestration path.
- If running in Claude and native parallel sub-agents are available, continue with the native sub-agent workflow described here.
- If the preferred Codex multi-agent path is unavailable and native parallel sub-agents are available in the current runtime, use that native sub-agent workflow.
- Keep each spawned worker bridged back to the coordinating session so findings can be gathered, merged, and written into `.code-review-reports/<ID>/review-*.md`.
- Serial execution is allowed only if Codex multi-agents and native sub-agents are unavailable.
- Serial execution must be announced explicitly to the user as an incomplete downgrade from the preferred orchestration path.
- Do not silently replace parallel topic review with a manual coordinator-only review.
- Even in serial downgrade mode, still run the requested number of iterations per slice and feed earlier findings into later passes.

### Big Feature Folder Splitting

When the selected scope is **Feature Folder**, inspect the folder before launching agents.

- Treat the folder as **big** when it has `3+` immediate child directories with reviewable files and `15+` files total beneath the selected folder
- Example: `ProcessStep2/[MainDialog/ConfigurationModal/DataTable]`
- For a big folder, create one review slice per immediate child directory and run the full topic set for each slice
- With `10` topics and `3` child directories, launch `30` review agents
- Root-level files in the selected feature folder remain shared context for every slice when needed
- Multiply the slice count by the requested iteration count when estimating workload for the user

### Applicable Topic Rules

- For feature-folder scope, run the full review topic set unless a topic is provably irrelevant to the selected folder.
- For local changes, branch diff, and merge request scopes, the coordinator MUST run a pre-filter step before spawning any agents. Run `git diff dev...HEAD` (or the equivalent scope command) and grep it for each topic's trigger patterns below. Only spawn an agent for topics whose patterns match, or that are marked Always.
- If `.agents/rules/clean-code/**` changes, include every clean-code topic. If `.agents/rules/<domain-topic>/**` changes, include that domain topic.
- If `.agents/skills/fe-code-review/**`, `.agents/CODE-STANDARDS.md`, or `AGENTS.md` changes, include all topics because the review workflow or rule index changed.
- If a topic is skipped due to no pattern match, the output must say so.
- It is not valid to skip always-run topics or to skip a conditional topic whose patterns matched.

#### Topic Trigger Patterns (branch/PR/local scopes)

The coordinator runs each gate pattern as a single `grep -E` against the diff output. A match on any pattern triggers that topic.

- `linting`
  - Rule source: tool output plus owning clean-code/domain rule
  - Gate: Always (command-driven)
- `abstraction-boundaries`
  - Rule source: `clean-code/abstraction-and-boundaries.md`
  - Gate: `createContext|useContext|Provider|Context|adapter|wrapper|compat|controller|use[A-Z][A-Za-z0-9]*Logic|on[A-Z][A-Za-z0-9]*=|mode=|variant=|src/features/shared|src/features/ui`
- `components-jsx`
  - Rule source: `clean-code/components-and-jsx.md`
  - Gate: Always for any `.tsx` change
- `state-effects-routing`
  - Rule source: `clean-code/state-effects-routing.md`
  - Gate: `useState|useEffect|useNavigate|navigate\(|Route\.useSearch|useSearch|useParams|<Link|useControllableState|searchSchema`
- `types-imports-exports`
  - Rule source: `clean-code/types-imports-exports.md`
  - Gate: Always for any `.ts` or `.tsx` change
- `comments-suppressions`
  - Rule source: `clean-code/comments-jsdoc-suppressions.md`
  - Gate: `eslint-disable|@ts-expect-error|@ts-ignore|TODO|console\.|/\*\*|//`
- `control-flow-size`
  - Rule source: `clean-code/control-flow-and-size.md`
  - Gate: `if \(|else|switch \(|case |\? .*: |\.map\(|\.reduce\(|return .*&&|&& .*<`
- `async-performance`
  - Rule source: `clean-code/async-performance.md`
  - Gate: `await .*(forEach|map|reduce)|for .*await|Promise\.all|Suspense|useMemo|useCallback|debounce|virtual|useEffect|\.map\(.*=>.*<`
- `styling-ui-primitives`
  - Rule source: `clean-code/styling-ui-primitives.md`
  - Gate: `className=|cn\(|cva\(|tailwind|styled-components|style=|src/features/ui|focus-ring|--[A-Za-z0-9-]+`
- `testing-verification`
  - Rule source: `clean-code/testing-verification.md`
  - Gate: `\.test\.|\.spec\.|describe\(|it\(|test\(|expect\(`
- `project-maintenance-couplings`
  - Rule source: `clean-code/project-maintenance-couplings.md`
  - Gate: `package\.json|CHANGELOG|changelog|appVersion|version|generated|openapi|routeTree\.gen|api-clients`
- `codebase-structure`
  - Rule source: `codebase-structure/`
  - Gate: `src/|src/features/|src/routes/|src/hooks/|src/utils/|src/db/|\.search\.ts|\.preload\.ts|\.route-logic\.ts|\.logic\.ts|\.types\.ts|\.schema\.ts|\.collection\.ts|components/|hooks/|utils/|shared/`
- `a11y`
  - Rule source: `a11y/`
  - Gate: `<button|<input|<a |aria-|role=|tabIndex|focus-ring|iconOnly|onClick|onKeyDown`
- `security`
  - Rule source: `security/`
  - Gate: `dangerouslySet|innerHTML|eval|localStorage|sessionStorage|target.*_blank|href=|useHasTopicMutationRights|hasTopicMutationRights|useCanMutateProject|canMutateProject|assignProjectOwner|unassignProjectOwner|assignProjectMember|unassignProjectMember|replaceProjectAssignments|mvp_assignees|checked_saetze|mvp_checked|topic_id`
- `nodes`
  - Rule source: `nodes/`
  - Gate: `useNode|useNodes|useGraph|useDescendants|NodePayloadByType|NodeRef|useDescendantNodes|useNodesByType|useLiveNode|useLiveNodes|useAction`
- `api-integration`
  - Rule source: `api-integration/`
  - Gate: `useQuery|useMutation|api-clients|@tanstack/react-query|useInfiniteQuery|collection|openapi-ts`
- `forms`
  - Rule source: `forms/`
  - Gate: `useForm|formSchema|@tanstack/react-form|FieldLabel|zodResolver|z\.object`
- `i18n`
  - Rule source: `i18n/`
  - Gate: `useTranslation|locales/|i18n|t\(`

### Phase 2: Triage

Merge findings. Present to user grouped by severity and enumerated with IDs like `H1`, `M2`, `L3`. User marks each finding by ID, for example `fix H1, M2` or `ignore L1`. Valid actions are:

- **fix** — Agent should fix this
- **discuss** — Needs human discussion before action
- **ignore** — Intentional, skip this

The coordinator MUST preserve those IDs when findings are repeated later in the thread so the user can refer to them tersely.

The coordinator MUST write the merged findings to `.code-review-reports/<ID>/REVIEW-SUMMARY.md` before presenting triage to the user. The file must include:
- All in-scope findings with their severity IDs (`H1`, `M2`, etc.), file paths, and descriptions
- A separate `## Possibly out of scope` section with any out-of-scope findings
- A `## Topics` section listing every topic with its final status (`reviewed`, `skipped-with-reason`, or `failed`) and the reason for any skip

### Phase 3: Fix

Use the `fix-review` workflow to iterate through all `fix` findings.

Before editing code, the coordinator MUST build a fix plan from all findings marked `fix`:

1. Estimate the write set for each finding from the finding file path, suggested fix, likely tests, locale files, and directly owned helper files.
2. Group findings whose write sets overlap or whose fixes share the same state owner, mutation flow, route/search state, generated data contract, or UI component API.
3. Mark only findings with low or no touched-file overlap as parallel-worker eligible.
4. Spawn one fix worker per eligible isolated finding or isolated finding group when native workers are available.
5. Keep overlapping, uncertain, cross-cutting, lint-bucket, formatter, and review-file update work in the coordinator session or in a serial worker sequence.

Parallel fix workers MUST receive an explicit owned write set and must be told they are not alone in the codebase, must not revert others' edits, and must not touch files outside their owned write set unless the coordinator explicitly expands ownership.

To avoid shared-file conflicts, workers should write their fix note to `.code-review-reports/<ID>/fix-<finding-id>.md` or report it back to the coordinator. The coordinator owns updating `.code-review-reports/<ID>/review-merged.md`, running final formatting, and running verification after worker changes are integrated.

## Optional Companion Workflow

Use the `autonomous-loop` workflow when review or fix work should continue without interactive menus or per-finding interruption.

## Completion Requirements

Do not present the review as complete unless all of the following are true:

- The orchestration path was executed, or an explicit downgrade was disclosed.
- Every applicable topic has an artifact or merged result.
- Every applicable slice completed the requested number of review iterations, or any shortfall was disclosed.
- The final response lists every topic with one of: `reviewed`, `skipped-with-reason`, or `failed`.
- The final response enumerates findings with severity-prefixed IDs that can be referenced directly in follow-up fix instructions.
- The final response distinguishes findings from summary text.

A review that skips the orchestration path without disclosure is incomplete and should not be presented as a completed `fe-code-review` skill run.
