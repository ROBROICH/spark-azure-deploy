# Dead Code & Unused Dependencies

Detect code and dependencies that are defined but never used.

Dead code inflates the codebase, confuses new contributors, and often masks bugs.
Unused dependencies increase the attack surface and bloat container images.

## Checks

### 1. Unused imports (Minor — mostly caught by ruff F401)

Cross-check with ruff output if available. If ruff was not run, search manually with Grep
for `^from .+ import|^import ` patterns and verify each import is used in the file.

### 2. Dead functions and classes (Major)

For each function/class defined in `src/`, search for references across the module using Grep.

If a function/class is:

- Only referenced at its definition site (never called/imported elsewhere)
- Not registered in `main.py` as a workflow or activity
- Not exported via `__init__.py`
- Not a Pydantic model used for serialization

Then flag it as dead code.

Do NOT flag:

- Test helpers in `tests/`
- Functions in `evals/`
- Abstract methods or protocol methods
- Dunder methods (`__init__`, `__str__`, `__repr__`, etc.)
- Functions decorated with `@workflow.defn`, `@workflow.run`, `@activity.defn`

### 3. Unused dependencies in pyproject.toml (Major)

Read `pyproject.toml` in the target directory. For each package under `[project.dependencies]`:

- Derive the Python import name (e.g. `qdrant-client` → `qdrant_client`, `python-dotenv` → `dotenv`)
- Search for that import in the source code under `src/`

If no import is found anywhere in `src/`, flag the dependency as unused.

Do NOT flag:

- `temporal` (workspace package, may be imported indirectly)
- Dev dependencies under `[dependency-groups.dev]`
- Packages that are runtime-only (e.g. `uvloop` used via env var, not import)

### 4. Unused variables (Minor — mostly caught by ruff F841)

Cross-check with ruff output. Flag variables assigned but never read.

## Report

List each finding with file path, line number (for code) or package name (for deps),
category, and severity.
