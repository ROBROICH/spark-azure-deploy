---
name: clean-code-audit
description: |
  Comprehensive code quality audit for Python directories in the monorepo. Combines automated
  linting (ruff, pyrefly) with LLM-based reviews for Temporal compliance, dead code, security,
  and code quality (nesting, length, naming, duplication).

  Trigger this skill whenever the user mentions code quality, clean code, code smells, static analysis,
  linting, code health, technical debt, or asks to audit, scan, check, or review any Python directory,
  module, or package — even if they don't explicitly say "audit". Also trigger on /code-audit.
---

# Code Audit

Full code quality audit for a Python workspace member. Runs 5 check categories in parallel and
produces a consolidated report grouped by severity.

## Step 1: Ask for the target directory

Always start by asking the user which directory to audit — even if they mentioned one already,
confirm it. To make this easy, parse the workspace members from the root `pyproject.toml`
(`[tool.uv.workspace].members`) and present them as selectable options. The user can also
specify a custom path.

## Step 2: Run ruff and pyrefly directly (in this session)

Run the static analysis tools yourself using Bash — do NOT delegate this to a subagent,
as subagents don't have shell permissions.

**Ruff:**

```bash
uv run ruff check <target_directory> --output-format=concise 2>&1
```

**Pyrefly** (only if `[tool.pyrefly]` is present in the target's `pyproject.toml`):

```bash
cd <target_directory> && uv run pyrefly check 2>&1
```

Save the full output from both tools — you'll pass it to the LLM review agents in Step 3
so they can deduplicate against it.

## Step 3: Run LLM review agents in parallel

Spawn 4 subagents in parallel using the Agent tool. Pass the ruff/pyrefly output to each
so they can avoid duplicating findings already caught by the tools.

Give each agent a prompt like:

```
Read the check instructions at <skill-path>/references/<check>.md.
Run every check described there against the directory: <target-directory>.

Ruff output (already run — do not re-run ruff):
<paste ruff output here>

Important:
- Use Grep for code pattern searches, Read for file inspection
- Do NOT use Bash — it is not available to you
- Skip any finding already caught by ruff above
- For each finding, include: file path, line number, check name, severity, and a one-line description
- Return your findings as a structured list, grouped by severity (Critical > Major > Minor)
- If a check category doesn't apply (e.g. no Temporal code), say so and skip
```

The 4 agents and their reference files:

| Agent               | Reference                    | What it checks                                                |
| ------------------- | ---------------------------- | ------------------------------------------------------------- |
| Temporal compliance | `references/temporal.md`     | Workflow/activity conventions (auto-skip if no Temporal code) |
| Code quality        | `references/code-quality.md` | Nesting, length, naming, duplication, comments                |
| Dead code           | `references/dead-code.md`    | Unused functions, imports, dependencies                       |
| Security            | `references/security.md`     | Credentials, eval(), timeouts, error handling                 |

## Step 3: Consolidated report

After all agents return, merge findings into a single report. Write it to `code-audit.md`
in the target directory.

Use this structure:

```markdown
# Code Audit: <directory name>

Audited on: <date>

## Critical

- **[security]** hardcoded password in `src/config.py:12`
- ...

## Major

- **[temporal]** missing workflow identifier in `src/workflows/my_workflow.py`
- **[dead-code]** function `old_handler` in `src/utils.py:45` is never called
- ...

## Minor

- **[quality]** function `process` in `src/main.py:80` is 55 lines — consider splitting
- ...

## Tool Output Summary

- ruff: X errors, Y warnings
- pyrefly: X errors (or "skipped — no [tool.pyrefly] config")

## Stats

- Files scanned: N
- Total findings: N (X critical, Y major, Z minor)
```

### Severity classification

| Severity | What qualifies                                                                                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Security issues, hardcoded credentials, `eval()`, bare `except` swallowing errors                                                                                                                                                                  |
| Major    | Temporal guideline violations, dead code, unused dependencies, `sys.exit()` in library code, deeply nested code (>4 levels), files >500 SLOC, code duplication, excessive indirection / call-chain depth, parameter threading through 5+ functions |
| Minor    | Unclear names, long functions (>80 lines), valueless comments, non-ASCII identifiers, `lru_cache` on methods, mutable defaults                                                                                                                     |

### Deduplication

Some findings overlap between agents (e.g. ruff catches unused imports, dead-code agent also checks).
Deduplicate: if ruff already flagged it, don't repeat it from the LLM-based check. Mention in the
report that ruff covered it.
