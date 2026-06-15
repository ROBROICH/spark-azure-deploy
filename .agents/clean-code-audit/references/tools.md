# Static Analysis (ruff + pyrefly)

Note: ruff and pyrefly are run directly by the orchestrating session (not by a subagent) in Step 2
of the main workflow, since subagents don't have Bash permissions. This reference file documents
what each tool checks and how to interpret the output.

## What ruff checks

Ruff config lives in the root `pyproject.toml`. Key rules enforced:

- `UP` — pyupgrade (modern Python syntax)
- `I` — isort (import ordering)
- `C901` — McCabe complexity (max 15)
- `ERA` — no commented-out code
- `B` — flake8-bugbear
- `N` — pep8-naming
- `A` — no shadowing builtins
- `C4` — comprehension style
- `T10` — no debugger statements
- `E`/`W`/`F` — default pycodestyle + pyflakes (unused imports F401, unused vars F841, etc.)

## What pyrefly checks

Type errors, missing return types, incompatible assignments. Requires `[tool.pyrefly]` section
in the target directory's `pyproject.toml` to be configured.

## How to run (main session only)

```bash
# Ruff (from repo root):
uv run ruff check <target_directory> --output-format=concise 2>&1

# Pyrefly (from target directory, only if [tool.pyrefly] configured):
cd <target_directory> && uv run pyrefly check 2>&1
```
