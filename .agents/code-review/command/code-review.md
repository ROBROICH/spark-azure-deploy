---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git rev-parse:*), Bash(git fetch:*), AskUserQuestion
description: Code review changes (branch diff, staged, or uncommitted)
---

Provide a code review for local changes.

**Agent assumptions (applies to all agents and subagents):**

- All tools are functional and will work without error. Do not test tools or make exploratory calls. Make sure this is clear to every subagent that is launched.
- Only call a tool if it is required to complete the task. Every tool call should have a clear purpose.
- This is a self-hosted Gitea instance. The `gh` CLI is NOT available. Do NOT attempt to use it.
- All review output is presented directly to the user in the conversation. Do NOT attempt to post comments to any remote service.

## Step 1: Ask the user what to review

Use the AskUserQuestion tool (if available) to ask the user what they want reviewed:

- **Branch diff against origin/dev (Recommended)** — Review all changes on the current branch compared to `origin/dev`
- **Staged changes** — Review only `git diff --staged`
- **Uncommitted changes** — Review all uncommitted changes (`git diff` + `git diff --staged`)
- **Custom** — Let the user specify a custom diff target (e.g. a different base branch or commit range)

If the user provided arguments when invoking this skill that already answer this question, skip asking and use their input directly.

## Step 2: Fetch the diff

Run `git fetch origin dev` first to ensure origin/dev is up to date (skip if reviewing staged/uncommitted only).

Based on the user's choice:

- **Branch diff**: `git diff origin/dev...HEAD`
- **Staged**: `git diff --staged`
- **Uncommitted**: `git diff HEAD`
- **Custom**: whatever the user specified

If the diff is empty, inform the user and stop.

## Step 3: Gather CLAUDE.md files

Launch a haiku agent to return a list of file paths (not their contents) for all relevant CLAUDE.md files including:

- The root CLAUDE.md file, if it exists
- Any CLAUDE.md files in directories containing files touched by the diff

## Step 4: Summarize the changes

Launch a sonnet agent to read the diff and return a brief summary of what changed and why (inferred from commit messages and code context).

## Step 5: Review the changes

Launch 4 agents in parallel to independently review the diff. Each agent should return the list of issues, where each issue includes a file path, line reference, description, and the reason it was flagged (e.g. "CLAUDE.md adherence", "bug").

Agent 1: Opus bug agent
Scan for obvious bugs. Focus only on the diff itself without reading extra context. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that you cannot validate without looking at context outside of the diff.

Agent 2: Opus bug agent
Look for problems in the introduced code. This could be security issues, incorrect logic, etc. Only look for issues that fall within the changed code.
**Check `common-issues.md` and apply any relevant rules**

Agent 3: Opus maintenance agent
Look for code that is

- Too DRY or has a lot of indirections across multiple files
- Has deeply nested if else/elif chains
- Has return statements in an if-block and an else that could be changed to an early return
- Uses bare dicts or lists instead of named tuples or classes
- Overly verbose comments that only mimic what the function signature already says
- Declaration of variable not close to its first use
- Parameters that are passed across multiple functions instead of using contextvars

Agent 4: Opus error-handling agent
**Read `error-handling.md` and apply every rule in it to the diff.** This agent focuses exclusively on error-handling patterns. Scan every `try/except` block, every `asyncio.gather` call, and every pipeline/queue pattern in the diff for:

- `except` blocks that catch and continue without re-raising (silent error swallowing)
- `asyncio.gather` used where `asyncio.TaskGroup` should be used instead
- Pipeline stages where a failure in one stage leads to the next stage silently receiving empty/partial input
- Functions that can return empty/partial results because errors were caught, where the caller cannot distinguish "no data" from "all calls failed"
- `except Exception` or `except BaseException` used as a "resilience" pattern that actually causes silent data loss
- Loop bodies with `except ... continue` that silently skip failed items

For each violation found, cite the specific rule from `error-handling.md` that was broken.

**CRITICAL: We only want HIGH SIGNAL issues.** Flag issues where:

- The code will fail to compile or parse (syntax errors, type errors, missing imports, unresolved references)
- The code will definitely produce wrong results regardless of inputs (clear logic errors)
- Clear, unambiguous CLAUDE.md violations where you can quote the exact rule being broken

Do NOT flag:

- Potential issues that depend on specific inputs or state
- Subjective suggestions or improvements

If you are not certain an issue is real, do not flag it. False positives erode trust and waste reviewer time.

Each subagent should receive the diff summary from Step 4 for context on the author's intent.

## Step 6: Validate issues

For each issue found in Step 5 by agents 1, 2, 3, and 4, launch parallel subagents to validate the issue. Each subagent receives the diff summary and a description of the issue. The agent's job is to confirm the issue is real with high confidence by reading the relevant source files. Use Opus subagents for bugs and logic issues, and sonnet agents for CLAUDE.md violations.

## Step 7: Filter

Filter out any issues that were not validated in Step 6.

## Step 8: Present results

If NO issues were found, output:

---

## Code review

No issues found. Checked for bugs and CLAUDE.md compliance.

---

If issues WERE found, present each issue clearly with:

- The file path and line number(s)
- A description of the issue
- The category (bug, CLAUDE.md violation, security, logic error, error handling, etc.)
- A suggested fix where applicable

## False positive list

When evaluating issues in Steps 5 and 6, do NOT flag any of these:

- Pre-existing issues (not introduced by the diff)
- Something that appears to be a bug but is actually correct
- Pedantic nitpicks that a senior engineer would not flag
