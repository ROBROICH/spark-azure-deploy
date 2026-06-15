# State, Effects, and Routing

Use when code touches `useState`, `useEffect`, route params/search, navigation, prop-synced state, or `useControllableState`.

## Rules

- Do not reach for `useState` by default. Keep it for ephemeral UI state such as hover, focus, animation, and pre-submit form input. URL-worthy state, server state, shared workflow state, and synced props belong in the router, query/DB layer, context/owner, or `useControllableState`.
- Do not sync props into local state with `useEffect`. When local state must be externally controlled, use `useControllableState`; treat `src/utils/hooks/useControllableState.ts` as protected and modify it only when explicitly requested.
- Do not use `useEffect` for derived values, data fetching, state reactions, or event responses. Prefer render-time derivation, event handlers, TanStack Query/DB, refs, `useSyncExternalStore`, or `useLayoutEffect` where that integration is the right boundary.
- Allowed `useEffect` calls must integrate with an external system that has no better React abstraction and must include a brief local justification comment.
- Use TanStack Router patterns only. Do not import React Router APIs or copy React Router mental models.
- Keep filters, pagination, sorting, tabs, and other URL-worthy state in TanStack Router search params. Use route-file Zod search schemas, `Route.useSearch()`, `Route.useSearch({ select })`, `useParams()`, and route-owned navigation helpers.
- On hot paths, select only the search fields the owner needs. It is fine for one owner to select several related fields in one `useSearch({ select })`; avoid reading the whole search object when only a subset is used.
- If a route-derived value would only be threaded unchanged through intermediate components, prefer a local selective `useSearch({ select })` read in the true consumer, unless that would split one coordinated workflow owner.
- For URL-backed text inputs, use a two-phase flow: instant local echo, debounced router commit. Prefer `src/features/ui/SearchInput/DebouncedSearchInput.tsx` over raw `SearchInput` plus custom debounce at each call site.
- Use TanStack Router `<Link>` for navigation UI users can click or keyboard-activate. Reserve `navigate()` for imperative flows such as post-submit redirects, auth guards, effect-driven redirects, or command handlers that are not themselves links.
- Use `replace` for same-screen URL refinements that should not create noisy Back-button history, such as debounced search commits, sort/filter changes, pagination size changes, or tab refinements. Do not use `replace` for meaningful navigation steps or screens with a dedicated Back affordance.

## Report When

Report effect chains, mirrored props, local URL state, React Router drift, raw high-frequency URL writes, broad search subscriptions, fake link buttons, missing history semantics, or unrequested changes to `useControllableState`.

## Human Triage Suggestion

Name the owner that should hold the state: router search, a route schema, a feature owner/context, `useControllableState`, an event handler, or a real external-system effect with a justification comment.

## References

- `references/link-navigation-rationale-and-examples.md`
