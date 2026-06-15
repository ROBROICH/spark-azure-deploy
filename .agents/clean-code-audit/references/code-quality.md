# Code Quality

LLM-based review for structural quality issues that static analysis cannot catch.
These checks target readability and maintainability problems that accumulate over time.

Read each Python file in the target directory and its subdirectories.

## Checks

### 1. Valueless comments (Minor)

Flag comments that restate what the code does instead of explaining why:

- `# increment counter` above `counter += 1`
- `# return result` above `return result`
- Docstrings that only restate the function signature (`Args: x (int): the x value`)
- Historical comments (`# was done by X before`, `# moved from Y`)

Do NOT flag:

- Comments explaining non-obvious business logic or constraints
- `# type: ignore` or `# noqa` pragmas
- TODOs (tracked separately)

### 2. Long functions (Minor >80 SLOC, Major >150 SLOC)

Count source lines (excluding blank lines and comments) per function/method.

- > 80 SLOC: Minor — note it, but a long function that reads top-to-bottom is often better
  > than splitting into many small functions that force the reader to jump around
- > 150 SLOC: Major — at this point the function is likely doing too much

The goal is readability, not short functions. A 200-line function that tells a clear story
is better than 10 tiny functions where you're constantly jumping between definitions to
understand the flow. Only flag long functions as problematic when they also have other issues
(deep nesting, multiple responsibilities, poor naming). Don't suggest extraction just because
of line count alone.

Also note: docstrings inflate line counts significantly when code is modularized — 10 small
functions with 5-line docstrings each add 50 lines of docstrings alone.

### 3. Large files (Major >500 SLOC)

Count total source lines per file. Flag files exceeding 500 SLOC.

Keep in mind that 1 large file containing related logic is often better than 4 small files
that force the reader to jump between tabs. Only flag when the file genuinely contains
unrelated concerns that would benefit from separation — not just because it's long.

### 3a. Excessive indirection / call-chain depth (Major)

Flag cases where code creates unnecessarily deep call chains: `func1 -> func2 -> func3 -> func3_1`
where the reader has to jump through 4+ function definitions just to follow one logical operation.

Look for:

- Wrapper functions that add no logic, just forward to the next function
- Functions that are only called from one place and exist solely because "functions should be short"
- Parameters that are passed through 5+ function calls without being used until the bottom
  of the chain (parameter threading / "bucket brigade" anti-pattern)

This matters because excessive indirection kills readability — the reader loses context jumping
between definitions and has to hold an ever-growing mental stack. A flat, readable flow is
preferable to deeply nested call chains created for abstraction's sake.

### 4. Deep nesting (Major >4 levels)

Flag blocks with more than 4 levels of indentation from `if`/`for`/`while`/`try`/`with`.
Suggest early returns, guard clauses, or extraction.

### 5. Unclear identifiers (Minor)

Flag:

- Single-letter variables outside of `i`, `j`, `k`, `e`, `f`, `x`, `y` in small scopes
- Cryptic abbreviations that don't convey intent (e.g. `rb`, `pf`, `nid` without context)
- Inconsistent naming (mixing `camelCase` and `snake_case` within the same file)

Do NOT flag:

- `_` for unused variables
- Well-known conventions like `cls`, `self`, `db`, `id`, `pk`

### 6. Code duplication (Major)

Duplicated logic is a maintenance hazard: when a bug is found in one copy, the others are often
missed. Flag when the same logic (>10 lines) appears in 2+ places within the module. Look for:

- Copy-pasted `asyncio.gather` patterns with nearly identical bodies
- Repeated HTTP client setup
- Duplicated error handling blocks
- If/else branches with near-identical bodies

### 7. Non-ASCII identifiers (Minor)

Flag variable, function, or class names containing non-ASCII characters (e.g. `ä`, `ü`, `ß`).

### 8. Memory pitfalls (Minor)

- `functools.lru_cache` or `functools.cache` on instance methods (memory leak risk)
- Mutable default arguments (`def f(x=[])`)

## Report

List each finding with file path, line number, category, and severity.
