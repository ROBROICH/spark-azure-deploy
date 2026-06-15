# Security

Scan for security anti-patterns and vulnerabilities. These checks target patterns that
lead to credential leaks, injection attacks, or silent failures in production.

## Checks

### 1. Hard-coded credentials (Critical)

Credentials in source code end up in git history and are extremely difficult to fully remove.
Search for patterns like:

```
password\s*=\s*["']
api_key\s*=\s*["']
secret\s*=\s*["']
token\s*=\s*["']
```

Flag any string literals that look like real credentials (not placeholders like `"abc"`, `"test"`,
`""`, or env var references).

Do NOT flag:

- Values in `.env.example`, `.env.local`, or test fixtures with obvious dummy values
- References to env vars (`os.getenv("SECRET")`)
- Pydantic Settings fields without defaults

### 2. eval() usage (Critical)

`eval()` executes arbitrary code — any user-controlled input reaching it is a remote code execution
vulnerability. Even with trusted input, it makes the attack surface much larger.

Flag all uses. Suggest `ast.literal_eval` for literal parsing, or structured parsing (JSON, Pydantic).

### 3. HTTP requests without timeout (Major)

Without an explicit timeout, a network call can hang indefinitely, tying up the worker and
eventually causing cascading failures. This is especially dangerous in Temporal activities
where a hung activity blocks the workflow.

Search for `httpx.(get|post|put|delete|patch|request)` and `requests.(get|post|put|delete|patch|request)`
calls. Check if a `timeout` parameter is set. Also check `httpx.AsyncClient()` and `httpx.Client()`
constructors for missing `timeout`.

### 4. Bare except swallowing errors (Critical)

Catching broadly and continuing without re-raising silently converts failures into empty/partial
results. The system appears to work but returns wrong data — strictly worse than failing loudly.

Search for `except` blocks that catch `Exception`, `BaseException`, or bare `except:` and do not
re-raise.

Do NOT flag:

- `except` with `raise` inside
- Top-level entry points (`if __name__ == "__main__"`)
- Explicit partial-failure tracking (`BatchResult(succeeded=..., failed=...)`)

### 5. sys.exit() in library code (Major)

Library and service code should raise exceptions so callers can decide what to do. `sys.exit()`
kills the process, bypassing cleanup and making the code untestable.

Flag uses in `src/`. Do NOT flag uses in `evals/` or CLI scripts.

### 6. Subprocess with partial paths (Minor)

Flag `subprocess.run`, `subprocess.call`, `subprocess.Popen`, `subprocess.check_output` calls
where the command is a bare name without a full path.

### 7. XML external entity risks (Minor)

Flag XML parsing (`xml.etree`, `lxml.etree`, `xml.dom`, `xml.sax`) without explicitly disabling
external entities.

## Report

List each finding with file path, line number, description, and severity.
