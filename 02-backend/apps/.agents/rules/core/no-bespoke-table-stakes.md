---
name: no-bespoke-table-stakes
description: Use before implementation or review when a change may hand-roll ordinary mechanics, create a parallel subsystem beside an existing repository, platform, managed-service, library, or maintained open-source owner, repeat low-level ceremony, hide mental bookkeeping, or grow the final review surface.
---

# No Bespoke Table Stakes

## Overview

This skill protects reviewability. It prevents agents from rebuilding normal software behavior from scratch in a worse local shape, hiding complexity behind shallow helpers, or turning code review into process theater. The final code must be easier to read from top to bottom, not merely split into more named pieces.

## Trigger

Use this skill before writing or reviewing code when any of these are true:

- The same ordinary mechanics appear more than once.
- The code manually rebuilds behavior a runtime, framework, test runner, library, or local project primitive should already provide.
- A test or implementation repeats low-level setup, failure handling, polling, file-state probing, HTTP plumbing, serialization, parsing, cleanup, or assertion ceremony.
- The proposed fix adds more lines, helpers, wrappers, or concepts while claiming to make the code simpler.
- A reviewer would have to read repeated mechanics instead of the intended product behavior.
- The code makes a maintainer track hidden state across files, callbacks, helpers, mocks, fixtures, or process-local setup.
- A change uses agents, planning, skills, or review rituals without producing a smaller, clearer implementation.
- A local shortcut, sentinel, placeholder, fake idle operation, mock seam, or "only tests" exception is being used to pass validation or satisfy types.

This applies to any codebase. It is especially common in backend and tests, but it is not a backend-only rule.

## Standard

Repeated table-stakes mechanics are a design failure, not an acceptable local style. Do not make the reader reconstruct ordinary behavior from repeated blocks of control flow.

Before adding code, name the ordinary capability being rebuilt. Look for the existing runtime, framework, test-runner, library, or repository primitive that owns it. If a real primitive exists, use it directly instead of creating a local imitation.

### Prove capability ownership before implementation

Do not start from the ticket's proposed mechanism. Start from the capability it
needs. Inspect, in order:

1. Current repository code, configuration, infrastructure manifests, and
   operator runbooks.
2. The deployed platform or managed service that already owns the domain.
3. The language runtime, framework, test runner, and installed dependencies.
4. Maintained open-source tools when the capability is established table
   stakes.

Record the owner selected and the exact gap it leaves. Custom code is justified
only for that uncovered gap. Integrate with the existing owner at its supported
boundary; do not duplicate its storage, lifecycle, scheduler, retry model,
catalog, parser, backup format, recovery engine, credential model, or control
plane.

A ticket is not proof that a bespoke subsystem belongs in the product. If the
ticket conflicts with the current repository or deployed architecture, correct
the ticket and implement the current owner. Do not preserve the proposed
mechanism as a compatibility path.

The ownership search must be proportional and concrete. It is not an open-ended
technology survey. Infrastructure, backup and recovery, authentication,
serialization, parsing, queues, schedulers, storage, HTTP clients, polling, and
provider integrations always require this check because established owners are
likely.

If the repeated mechanics are truly project-specific, solve them once behind a clear interface that changes how the call sites read. The boundary must let callers state intent, not rehearse the mechanics.

A boundary earns its place only when it removes repeated policy, hides real complexity, enforces an invariant, or owns an external edge. It is not earned when it only renames an operation, moves noise one click away, or preserves the same mental model behind a nicer name.

Reviewability is the product. A reader should be able to follow the code without keeping a private map of fixture state, mock setup, fallback behavior, magic strings, lifecycle side effects, or helper chains. If the implementation requires that map, rewrite the implementation.

## Rewrite Bar

When this skill is triggered on an existing change, rewrite the change. Do not patch around the repeated mechanics.

The rewrite is acceptable only when the final diff has a smaller reviewer surface:

- Fewer repeated blocks.
- Fewer exposed moving parts at call sites.
- Less low-level control flow in tests and feature code.
- More direct product or domain intent.
- No decorative helper layer that a maintainer must click through to understand the same behavior.
- No sentinel values, fake paths, fake IDs, noop operations, or placeholders crossing a real boundary.
- No test-only architecture that would be embarrassing in production code.
- No agent-generated plan that survives only as process evidence while the code remains hard to read.

If the rewrite grows the PR, adds concepts, or makes the review require more state in the reader's head, it has failed even if the code is factored into smaller pieces.

## Review Discipline

When extra agents are used, use them to find repeated table-stakes mechanics and challenge surface-area growth. Do not turn agent review into process theater.

Ask each reviewer to answer these questions:

- What ordinary capability is being rebuilt here?
- Which repository, platform, managed-service, library, and maintained
  open-source owners were checked?
- What exact requirement is not covered by the selected existing owner?
- Does this change integrate at that owner's supported boundary, or create a
  second source of truth and lifecycle?
- Where is the repetition or mental bookkeeping leaking into call sites?
- Is there an existing platform, framework, library, or project primitive that should own this?
- If a new boundary is proposed, does it reduce total code and total concepts?
- Would a maintainer usually need to click through the boundary while debugging?
- Does the final PR read through the intended behavior instead of repeated mechanics?
- Did the agent remove the actual cause, or only describe symptoms and local dos and don'ts?
- Did the final code get smaller and clearer, or did the process merely become more elaborate?

The answer must be grounded in the actual changed code and current deployed
architecture, not in hypothetical future reuse. Every review includes a short
`Capability ownership` verdict naming the selected owner and remaining gap. A
clean review without that verdict is invalid. A parallel subsystem beside an
established owner is a Major finding even when its local implementation is
correct and well tested.

## Hard Rules

- Do not write code examples in this skill or in downstream instructions derived from it.
- Do not overfit this skill to one file, one snippet, or one framework.
- Do not solve repeated mechanics by adding a thin wrapper around the same mechanics.
- Do not add a helper solely to make a caller shorter.
- Do not accept "more code but organized" as a simplification.
- Do not accept a parallel subsystem because the ticket prescribed it, the code
  works locally, or replacing it would move work to another repository.
- Do not return a clean review without a concrete capability-ownership verdict.
- Do not keep duplicated table-stakes mechanics in tests because they are "only tests."
- Do not finish a review-triggered rewrite until the repeated mechanics are removed or there is a concrete reason they cannot be removed in this change.
- Do not use empty strings, dummy paths, fake IDs, missing markers, synthetic idle objects, or placeholder state to satisfy types.
- Do not confuse a skill, plan, subagent transcript, or PR comment with a fix. The code has to improve.
- Do not call something simpler if the reviewer must remember more concepts, lifecycle details, or hidden state.

## Completion Standard

Before finishing, state the selected capability owner, the exact gap filled by
custom code, what table-stakes behavior was avoided or collapsed, where repeated
mechanics disappeared, and why the final surface is easier to review. If an
existing owner already covers the capability, erase the competing implementation.
If you cannot make the change smaller or clearer, say that plainly and stop
instead of hiding the failure behind more structure.
