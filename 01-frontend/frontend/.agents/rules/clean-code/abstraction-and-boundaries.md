---
ruleId: clean-code/abstraction-and-boundaries
---

# Abstraction and Boundaries

Use when code adds or changes helpers, hooks, components, contexts, shared utilities, adapters, or cross-feature reuse.

## Rules

- Inline helpers, hooks, aliases, and wrappers that only rename a language/library operation, return another hook unchanged, or save a few characters without adding ownership, narrowing, transformation, load timing, or domain meaning.
- Do not add stores, registries, schedulers, caches, subscription layers, or other control planes for a local concern unless the visible/measured payoff is narrower and simpler than the machinery.
- Prefer one cohesive feature owner for a toolbar/table/dialog/summary workflow that shares route state, query state, derived options, navigation handlers, mutations, or selection. Treat `max-lines` as extraction pressure, not permission to split one workflow into prop-heavy siblings.
- If a component needs more than 8 scalar props, or more than 2 grouped workflow objects plus 2 scalar props, redesign the owner boundary before adding more props.
- Use direct hook reads only for independent leaves with stable global/app data. Do not scatter route/query/node/mutation coordination across siblings just because each sibling can call a hook.
- Introduce feature context only when the same workflow state must cross multiple descendant levels. Direct or near-direct children should usually stay under a feature owner component.
- Non-trivial feature contexts must be structured as `use<Thing>ContextLogic`, `<Thing>Context`, `use<Thing>Context`, and `<Thing>Provider`; derive the context value type with `ReturnType<typeof use<Thing>ContextLogic>`, initialize with `createContext<... | null>(null)`, and throw when the provider is missing.
- Reject no-op APIs: callers should not pass `() => {}`, inert handlers, empty arrays with fake semantics, broad workflow bags, unused grouped fields, or mode flags such as `embedded`, `standalone`, `showToolbar`, or `showCreateButton` just to satisfy a shared contract.
- Pass cohesive domain objects to presentational/leaf components instead of exploding them into many scalars, but do not use grouped objects to hide a bad workflow boundary or unused handlers.
- Keep consumer-specific adapters near the consumer: picker options, avatar view models, table-cell models, labels, and other UI-shaped projections belong in the rendering feature unless the same adapter is duplicated by at least three real consumers.
- Shared filtering, sorting, searching, transformation, or create-flow logic used by multiple screens belongs in a neutral hook or utility, not in a feature owner component file. Reuse children and logic; do not import another screen's owner as shared logic.
- Duplication is acceptable when the alternative is a flag-heavy abstraction. If copied behavior must intentionally diverge, leave a short comment at the fork point explaining the boundary.

## Report When

Report wrapper slop, prop-bag slop, context-forwarder slop, flag-driven mega components, one-screen shared hooks, speculative stores, or copy/paste reuse that hides whether behavior should stay shared or diverge.

## Human Triage Suggestion

Name the simpler owner: inline the wrapper, narrow the component API, move one-screen adapters back to the consumer, extract shared logic to a neutral hook, or keep intentional duplication with a boundary comment.

## References

- `references/cohesive-feature-owner-examples.md`
- `references/context-logic-hook-examples.md`
