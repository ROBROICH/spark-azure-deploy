---
ruleId: backend/core/engineering
---

# Backend engineering rules

Read and obey the root `AGENTS.md` before working. Keep the implementation
direct, keep absence outside real operations, and leave contracts, runtime
behavior, and verification telling the same truth.

## Prefer the direct shape

- Ban indirection until it proves necessary.
- Inline one-off functions, pass-through wrappers, synonym helpers, tiny type
  aliases, factories, and adapters that add no behavior.
- Do not add a layer for a shorter caller, speculative flexibility, or to avoid
  updating local consumers.
- Keep a layer only when it owns external complexity, enforces an invariant,
  centralizes repeated policy, maps between real contracts, or removes
  substantial repeated branching.
- Improve an awkward owner API instead of hiding it behind a one-line alias.
- Prefer small, obvious duplication over an abstraction that moves code farther
  from its consumers.
- When removing an internal wrapper or replacing a path, update its consumers
  in the same change. Do not leave a deprecated alias or temporary shim unless
  the task explicitly requires a staged migration.

Do not mistake an externally owned contract for useless indirection. Inventory
public, persisted, recovery, audit, security, and cross-runtime consumers before
removing their boundary. Preserve or migrate one only when that contract is an
explicit requirement, not from speculative compatibility.

## Keep boundary inputs real

- Never pass placeholder IDs, paths, payloads, or values into an API, database,
  filesystem, command, cache, event, stream, or Temporal operation.
- Guard before constructing the real operation. A disabled flag or later early
  return is not input validation.
- Move nullable state outward into normal control flow so required inputs are
  non-null inside the operation owner.
- Do not invent values such as `missing`, `unknown`, `none`, an empty string,
  zero, or a dummy UUID unless the value belongs to the actual domain contract.
- If fallback behavior is real business policy, name and enforce it at the
  owning domain boundary.

Review the boundary as if a caller guard disappeared. If a fake value could
reach the real operation, move the guard outward.

## Do not manufacture idle operations

- Never create fake queries, noop commands, skipped jobs, placeholder streams,
  cache keys, operation IDs, or fallback option objects to disguise absence.
- Represent not-ready state in caller or UI control flow.
- Return a plain idle result only from a boundary that owns that result; do not
  counterfeit a downstream contract.
- Use a library-native skip or lazy primitive only when it is the intended
  top-level absence API and requires no invented key, command, path, payload, or
  operation object.
- Keep one real operation shape per call site.

## Integrate load-bearing changes

1. Identify the load-bearing claim and its canonical contract or entrypoint.
2. Update the smallest canonical artifact that defines current truth; remove
   stale promises and unsupported capability claims.
3. Implement one truthful runtime path. Fix the operator-facing path first when
   the main flow is wrong.
4. Update existing consumers, documentation, fixtures, migrations, scripts, and
   tests made obsolete by the change. Add tests only when the task requires
   them.
5. Run the narrow canonical verification that can prove the changed behavior.
6. Report the exact revision, command, result, remaining scope, and any
   external dependency.

Do not return success on critical failure. Do not let documentation outpace
implementation or implementation outpace verification. Record unrelated
cleanup as a separate finding instead of widening the authorized change.

