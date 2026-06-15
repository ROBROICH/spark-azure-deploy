# Control Flow and Size

Use when code changes branching, loops, conditional rendering, long functions/files, repeated literals, or mapping-style decisions.

## Rules

- Always use braces for `if`, `else`, loops, and similar control flow. This is lint-owned, but remaining cases matter because later edits can silently change behavior.
- Treat `max-depth` warnings as a prompt to flatten. Prefer early returns for loading, empty, invalid, disabled, and unauthorized states; after a branch returns, avoid wrapping the rest in `else` unless it is clearer.
- Extract heavily nested branching into helpers or file-based components instead of stacking `if`, `else`, chained ternaries, or mixed JSX branches.
- Treat oversized files/functions as refactor targets, not dumping grounds. When touching large code, extract helpers, child components, or feature-local modules before adding unrelated branches or JSX. JSX-returning components should be split for ownership/readability, not only for logic-line limits.
- If a large module must grow temporarily, isolate the new logic behind a named boundary so the next extraction is obvious.
- Use mapping objects for enum/union lookups instead of chained ternaries.
- Extract repeated domain string literals into a named constant when the value carries domain meaning, controls branching, or must stay synchronized. Do not create constants for one-off strings, import paths, obvious object keys, or short local literals. User-facing repeated copy belongs in i18n.

## Report When

Report deep nesting, chained ternary decision tables, repeated domain literals, oversized files absorbing unrelated work, missing braces that survived tooling, or helper extraction that still leaves the workflow unreadable.

## Human Triage Suggestion

Suggest one flattening move: return early, replace the chain with a mapping object, name the repeated domain value, extract a helper/child file, or split the next coherent module boundary.
