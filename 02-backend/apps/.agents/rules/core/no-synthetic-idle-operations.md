---
name: no-synthetic-idle-operations
description: "Prevent fake idle, skipped, noop, or placeholder operations from replacing a real nullable boundary. Use when adding or reviewing queries, mutations, commands, jobs, streams, effects, filesystem calls, or helpers that manufacture a fallback operation object because a required input is missing."
---

# No Synthetic Idle Operations

Do not replace an invalid operation with a fake idle operation. If the operation cannot exist without a required value, move the nullable boundary outward so the operation is only constructed where the value is present.

Do not replace a missing input with a fake query. The absent state is not a second query contract.

## Why This Is Wrong

- It mixes real generated options with a handmade fallback shape.
- It invents cache keys, operation IDs, noop commands, or placeholder streams that no domain owner defined.
- It makes "not ready" look like a real operation state.
- It spreads nullable handling into the operation layer instead of keeping it at the caller or UI/control-flow boundary.
- It creates future traps when invalidation, refetch, retry, logging, effects, or option reuse treats the fake operation as real.

## Required Direction

- Guard before constructing the operation.
- Split the component, hook, helper, command builder, or worker step so required inputs are non-null inside the operation owner.
- Return a plain idle/not-ready result from your own boundary when needed; do not fake the downstream operation contract.
- Use a library skip/lazy primitive only when it is the library's intended top-level absence API and does not require you to invent fallback keys, commands, paths, payloads, or option objects.
- Keep one operation shape per call site. Do not alternate between a real client-generated contract and a handmade placeholder contract.

## Review Question

Is this code modeling absence in normal control flow, or did it manufacture a fake operation so one call site could stay expression-shaped?
