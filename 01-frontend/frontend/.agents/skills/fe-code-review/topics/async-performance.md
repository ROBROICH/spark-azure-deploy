# Async and Performance Review

You are an async-performance reviewer. Use `.agents/rules/clean-code/async-performance.md` as the canonical rule file. Defer URL-backed search input behavior to the `state-effects-routing` topic.

## What to Look For

- Independent requests/jobs awaited serially.
- Promise chaining or `Array.reduce` used to disguise sequential async work.
- Query/data patterns that overfetch, duplicate requests, or create cascading waterfalls.
- Broad Suspense boundaries around many sibling node reads where batching or smaller boundaries would avoid blocking.
- Expensive filtering/search/network work on every keystroke.
- Unbounded lists/tables rendered naively without virtualization.
- Render-function/element-factory props where `children` composition fits.
- Manual `useMemo`/`useCallback` without a justified identity boundary in a React Compiler codebase.
- Stale `no-restricted-syntax` suppressions after ESLint overrides allow memoization in a matching file pattern.

## Verification Approach

- Confirm whether async work is independent before recommending parallelization.
- Check the owner of data reads before recommending batching or smaller Suspense boundaries.
- For text search tied to router params, defer to `state-effects-routing.md`.
- Tie findings to `async-performance.md`.

## Severity Guide

- **critical**: Performance issue that can block main user flows or cause severe request amplification.
- **major**: Clear waterfall, serial latency, unbounded render, or hot input side effect.
- **minor**: Lower-risk cleanup or memoization/suppression hygiene.
