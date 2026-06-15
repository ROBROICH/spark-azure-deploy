# Async and Performance

Use when code changes requests, loops with async work, Suspense/data reads, search/filter input, long lists/tables, render factories, or manual memoization.

## Rules

- Do not serialize independent requests or jobs. Use `Promise.all`, `Promise.allSettled`, or a batch boundary when iterations can run in parallel. Keep explicit sequential loops only when order, dependency, or rate limiting requires it, and document the narrow reason with the suppression if lint flags it.
- Do not replace a real sequential loop with promise chaining or `Array.reduce` just to silence `no-await-in-loop`; that obscures intent without improving latency.
- Fetch only what the screen needs and prefer TanStack DB/query-layer composition that avoids duplicate or cascading requests.
- In Suspense code, avoid one broad boundary around many sibling node reads when that creates a render-time waterfall. Either batch visible refs in a shared owner with `useNodes(...)` or place smaller boundaries around independent leaves when leaf ownership is clearer.
- Do not fire expensive filtering, search, network work, or heavy local computation on every keystroke. Keep instant local echo and debounce/defer the expensive side effect. URL-backed router writes are owned by `state-effects-routing.md`.
- Virtualize lists/tables that can grow meaningfully large. Pair virtualization with stable row keys and predictable sizing when possible.
- Prefer `children` composition over inline render functions or element factories for wrapper components that mainly own layout.
- React Compiler is enabled: treat `useMemo` and `useCallback` as opt-in exceptions. Prefer plain expressions/functions unless a compiler opt-out, external identity boundary, context provider value, effect-sensitive callback, or verified runtime constraint needs stable identity.
- A manual memoization exception needs a narrow `eslint-disable-next-line no-restricted-syntax` with the exact reason, unless a matching ESLint override removes that selector for the file pattern. Read later `no-restricted-syntax` overrides as replacing earlier selector lists; stale memoization suppressions are cleanup findings.

## Report When

Report serial async slop, broad Suspense waterfalls, overfetching, hot input side effects, non-virtualized unbounded rows, render-function props used as layout composition, stale memo suppressions, or unjustified manual memoization.

## Human Triage Suggestion

Suggest the latency/identity fix: batch/parallelize, move the fetch to the owner, split/batch Suspense reads, debounce the expensive side effect, virtualize the table body, use `children`, or remove/narrow memoization.
