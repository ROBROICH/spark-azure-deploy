# Deep Review — Orchestration

Parallel topic-isolated code review with structured triage and automated fixing.

## Arguments

`$ARGUMENTS` may include: `[SCOPE | PR_URL | feature-folder <path>] [--topics topic1,topic2,...] [--skip-triage] [--fix-only]`

- **SCOPE** (optional): `local` | `branch` | `feature-folder <path>` | a merge request URL. If omitted, ask the user.
- A plain repo-relative directory path also counts as **Feature Folder** scope when it resolves to an existing folder.
- **--topics**: Comma-separated list to restrict topics. Default: all applicable topics.
- **--skip-triage**: Skip interactive triage, mark all findings as `fix` automatically.
- **--fix-only**: Skip review phase, go straight to fixing from an existing review file.

## Phase 0: Determine Review Scope

Follow the scope selection rules from `SKILL.md`:

1. If `$ARGUMENTS` contains a merge request URL → **Merge Request** scope
2. If `$ARGUMENTS` contains `local` or `uncommitted` → **Local Changes** scope
3. If `$ARGUMENTS` contains `branch` → **Branch Diff** scope
4. If `$ARGUMENTS` contains `feature-folder <path>` or an existing repo-relative directory path → **Feature Folder** scope
5. Otherwise → use the `AskUserQuestion` tool to present an interactive scope selection menu:
   - Question: "What should I review?"
   - Header: "Review scope"
   - Options:
     - label: "Local changes", description: "Uncommitted changes only (staged + unstaged)"
     - label: "Branch diff", description: "All changes on this branch vs dev"
     - label: "Merge request", description: "Review the checked-out PR branch or ask for a merge request URL"
     - label: "Feature folder", description: "Review an existing feature folder directly"
6. If the user selects "Merge request", ask for the PR URL or confirm that the current branch already matches the PR branch
7. If the user selects "Feature folder", ask for the repo-relative folder path to review. Prefer `src/features/<FeatureName>`, but allow any existing folder in this package.

## Phase 1: Gather the Review Input

Use the commands matching the determined scope.

### Local Changes scope

1. Run `git diff HEAD --name-only` to get changed files
2. Run `git diff HEAD` for the full diff
3. Save to `.code-review-reports/local-uncommitted/diff.txt` and `changed-files.txt`
4. Review ID: `local-uncommitted`

### Branch Diff scope

1. Run `git diff dev...HEAD --name-only` to get changed files
2. Run `git diff dev...HEAD` for the full diff
3. Save to `.code-review-reports/branch-<branch-name>/diff.txt` and `changed-files.txt`
4. Review ID: `branch-<branch-name>`

### Merge Request scope

1. If the user provided a merge request URL, extract the PR number when possible
2. Ensure the PR branch is checked out locally before reviewing. If it is not, ask the user to check it out or provide the source branch name.
3. Run `git diff dev...HEAD --name-only` to get changed files from the checked-out PR branch
4. Run `git diff dev...HEAD` for the full diff
5. Save the diff to `.code-review-reports/pr-<branch-name-or-number>/diff.txt`
6. Save the changed file list to `.code-review-reports/pr-<branch-name-or-number>/changed-files.txt`
7. Review ID: `pr-<branch-name-or-number>`

### Feature Folder scope

1. Resolve the selected folder path relative to the package root and ensure it exists
2. Run `rg --files <folder>` to collect the review file list
3. Save that file list to `.code-review-reports/feature-<normalized-folder-path>/changed-files.txt` for compatibility with the standard review flow
4. Save a directory inventory to `.code-review-reports/feature-<normalized-folder-path>/folder-structure.txt`
5. If the folder contains no reviewable files, stop and tell the user
6. Review ID: `feature-<normalized-folder-path>`
7. This scope has no diff file; review agents must inspect the real files directly

Use `<ID>` to refer to the review ID determined above.

## Phase 2: Determine Applicable Topics

Domain review topics map to their rule folders under `.agents/rules/`. Clean-code topics map to individual rule files under `.agents/rules/clean-code/`.

- `abstraction-boundaries`
- `components-jsx`
- `state-effects-routing`
- `types-imports-exports`
- `comments-suppressions`
- `control-flow-size`
- `async-performance`
- `styling-ui-primitives`
- `testing-verification`
- `project-maintenance-couplings`
- `linting`
- `api-integration`
- `nodes`
- `security`
- `a11y`
- `i18n`
- `forms`

Follow the applicable topic rules in `SKILL.md`.

- For local, branch, and PR scopes, run the canonical grep-pattern gate against the diff output.
- For feature-folder scope, run the full topic set unless a topic is provably irrelevant to the selected folder.
- If `.agents/rules/clean-code/**` changes, include every clean-code topic. If `.agents/rules/<domain-topic>/**` changes, include that domain topic.
- If `.agents/CODE-STANDARDS.md`, `.agents/skills/fe-code-review/**`, or `AGENTS.md` changes, include all topics because the review workflow itself changed.

If `--topics` was specified, intersect the auto-detected set with the user's selection.

### Identify the feature context

Before launching agents, determine the feature being reviewed:

1. Extract the feature description from the branch name when possible
2. Prefer the repo naming scheme, for example `feature/01-objections-toolbar` → `objections-toolbar`
3. If a PR URL is provided and the title is available locally, also use the PR title
4. Pass this context to all review agents so they can search for nearby feature patterns and docs

Print which topics will run and which are skipped, with the reason for each skip.

### Analyze feature folder size

Only for **Feature Folder** scope:

1. Count the total files under the selected folder
2. Count the immediate child directories under the selected folder that contain reviewable files
3. Treat the folder as **big** when it has `3+` such child directories and `15+` files total
4. If the folder is big, create one review partition per immediate child directory
5. If the folder is not big, use the selected folder as a single review partition
6. Keep root-level files in the selected feature folder available as shared context for every partition when needed

Example:

- `ProcessStep2/MainDialog`
- `ProcessStep2/ConfigurationModal`
- `ProcessStep2/DataTable`

With `17` applicable topics, this example launches `51` review agents.

## Phase 3: Launch Review Agents

Determine the review partitions before launching agents:

- Default for diff-based scopes: one partition for the whole diff
- Default for feature-folder scope: one partition for the selected folder
- Big feature-folder scope: one partition per immediate child directory

For each applicable topic and each review partition, launch one background review agent.

- Follow the runtime-specific parallelism rules in `SKILL.md`.
- Keep each spawned worker bridged back to the coordinating session so findings can be collected and merged into `.code-review-reports/<ID>/review-*.md`
- Only run serially after recording the explicit downgrade required by `SKILL.md`
- Launch all topic agents in one batch
- Use the strongest review-capable model available on the current platform

Each agent receives:

1. The topic-specific prompt from `.agents/skills/fe-code-review/topics/<topic>.md`
2. The changed files list: `.code-review-reports/<ID>/changed-files.txt`
3. The output file path:
   - single-partition review: `.code-review-reports/<ID>/review-<topic>.md`
   - partitioned feature-folder review: `.code-review-reports/<ID>/review-<topic>-<partition>.md`
4. The review partition path and label
5. The output format instructions below
6. For feature-folder scope only: `.code-review-reports/<ID>/folder-structure.txt`
7. For diff-based scopes only: `.code-review-reports/<ID>/diff.txt`

### Agent prompt template

```
You are reviewing code changes for the topic: <TOPIC_NAME>
Feature being reviewed: <FEATURE_NAME>
Branch being reviewed: <BRANCH_NAME>
Review scope: <REVIEW_SCOPE>
Review partition: <PARTITION_NAME>
Target directory: <TARGET_DIRECTORY>

## Your task
Read the changed files list at: <CHANGED_FILES_PATH>
Then read the topic-specific review guidelines from:
<TOPIC_GUIDELINES_PATH>

Treat the topic prompt as the source for which clean-code or domain rule files to load. For clean-code topics, load the mapped `.agents/rules/clean-code/*.md` file named by the prompt; for domain topics, use `.agents/rules/<TOPIC_NAME>/`. Do not report findings owned by other topics.

If the review scope is `feature-folder`:
- Read the folder structure at: <FOLDER_STRUCTURE_PATH>
- Inspect the real files in: <TARGET_DIRECTORY>
- Use the selected feature root for shared context when needed

If the review scope is not `feature-folder`:
- Read the diff at: <DIFF_PATH>
- Read the full changed file when the topic prompt requires full-file validation

Focus ONLY on your assigned topic. Do not comment on other aspects.
Write your findings to: <OUTPUT_PATH>

## Output format

Write a markdown file. Start with a YAML frontmatter block, then findings:

---
topic: <topic-name>
scope: <review-scope>
partition: <partition-name>
target_directory: <target-directory>
files_reviewed: <number>
findings_count: <number>
reviewed_at: <ISO timestamp>
---

# Review: <Topic Display Name>

## Finding DR-<topic-prefix>-001: <title>

- **Severity**: critical | major | minor
- **Confidence**: <0-100>
- **Needs Discussion**: yes | no
- **File**: <file-path>:<line-number>
- **Code**:
```

  <relevant code snippet>
  ```
- **Issue**: <description of the problem>
- **Suggested Fix**: <concrete fix suggestion with code>

## Finding DR-<topic-prefix>-002: <title>

...

If you find no issues for your topic, write:

---

topic: <topic-name>
scope: <review-scope>
partition: <partition-name>
target_directory: <target-directory>
files_reviewed: <number>
findings_count: 0
reviewed_at: <ISO timestamp>

---

# Review: <Topic Display Name>

No issues found for this topic. ✓

````

### Important rules for each agent

- For diff-based scopes, read the full diff
- For feature-folder scope, read the real files in the assigned partition directly
- Read the full changed file when the topic prompt requires full-file validation
- When the feature folder was partitioned, keep findings focused on the assigned child directory and use feature-root files only as supporting context
- If the topic is `linting`, do not run `eslint --fix` or Prettier during review. Phase 1 is analysis only.
- If the topic is `linting` and findings exist, report them only as the two aggregate buckets `Autofixable lint findings` and `Lint findings fixable with AI help`. Do not enumerate every lint warning in the report.
- Confidence threshold: only report findings with confidence >= 70
- Mark findings as `Needs Discussion: yes` when:
  - the issue is subjective or architectural
  - multiple valid approaches exist
  - the pattern may be intentional
  - the change would alter public behavior or API shape
- Mark findings as `Needs Discussion: no` when:
  - it is an objective bug, typo, or rule violation
  - the fix is clear and non-controversial
  - it directly violates a documented project rule

### Topic prefixes for finding IDs

- `abstraction-boundaries`: `ABST`
- `components-jsx`: `JSX`
- `state-effects-routing`: `STATE`
- `types-imports-exports`: `TYPE`
- `comments-suppressions`: `COMM`
- `control-flow-size`: `FLOW`
- `async-performance`: `PERF`
- `styling-ui-primitives`: `STYLE`
- `testing-verification`: `TEST`
- `project-maintenance-couplings`: `MAINT`
- `linting`: `LINT`
- `api-integration`: `API`
- `nodes`: `NODE`
- `security`: `SEC`
- `a11y`: `A11Y`
- `i18n`: `I18N`
- `forms`: `FORM`

## Phase 4: Wait and Merge

1. Wait for all background review agents to complete
2. Read each `review-*.md` file
3. Create `.code-review-reports/<ID>/review-merged.md` with all findings sorted by severity (`critical`, then `major`, then `minor`), then by topic, then by partition when present

Format of the merged file:

```markdown
---
review_id: <ID>
reviewed_at: <ISO timestamp>
branch: <branch-name>
review_partitions:
  - <partition-name>
  - ...
topics_reviewed:
  - state-effects-routing
  - ...
topics_skipped:
  - <topic>: <reason>
total_findings: <N>
critical: <N>
major: <N>
minor: <N>
needs_discussion: <N>
---

# Deep Review: <branch-name or PR title>

## Summary

| Topic | Findings | Critical | Major | Minor |
| --- | --- | --- | --- | --- |
| State and Routing | 2 | 0 | 2 | 0 |
| ... | ... | ... | ... | ... |
| **Total** | **N** | **N** | **N** | **N** |

## Critical Findings

### DR-SEC-001: Unsafe HTML rendering from unsanitized content
- **Topic**: Security
- **Partition**: MainDialog
- **File**: src/features/example/UnsafePreview.tsx:42
- **Needs Discussion**: no
- **Status**: pending
...

## Major Findings
...

## Minor Findings
...

## Discussion Needed

These findings need human input before action.

## No Issues Found
- Forms ✓
- i18n ✓
````

## Phase 5: Interactive Triage

Skip this phase if `--skip-triage` was passed.

Present the merged review to the user. Then triage findings by severity.

- Prefer a multi-select question UI if the current platform supports it
- Otherwise ask the user plainly which findings should be `fix`, `discuss`, or `ignore`

Update each finding's `**Status**:` field in `.code-review-reports/<ID>/review-merged.md`:

- `fix` — will be auto-fixed
- `discuss` — needs discussion
- `ignore` — intentional, skip

Then print:

```
Triage complete:
- Fix: N findings
- Discuss: N findings
- Ignored: N findings

To continue with fixes: run the `fix-review` workflow for `<ID>`
For uninterrupted execution: run the `autonomous-loop` workflow in `fix` mode for `<ID>`
To discuss findings: open `.code-review-reports/<ID>/review-merged.md`
```

## Phase 6: Fix (if `--skip-triage` was used)

If `--skip-triage` was passed, mark all `Needs Discussion: no` findings as `fix` and all `Needs Discussion: yes` findings as `discuss`, then tell the user to continue with the `fix-review` workflow for the same review ID.

For unattended continuation, point the user to the `autonomous-loop` workflow in `fix` mode with the same review ID.

## Notes

- Review files persist in `.code-review-reports/`
- `.code-review-reports/` should stay gitignored
- Domain topics use `.agents/rules/<topic>/`; clean-code topics use their mapped `.agents/rules/clean-code/*.md` file
- The skill never auto-fixes without triage unless `--skip-triage` is passed
