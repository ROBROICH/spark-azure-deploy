---
name: no-sentinel-boundary-inputs
description: "Prevent fake placeholder values from crossing real code boundaries. Use when adding or reviewing API calls, queries, mutations, database calls, file paths, commands, event streams, or helper functions that use sentinel strings like missing, unknown, none, empty, or fallback IDs to satisfy types while a required input is absent."
---

# No Sentinel Boundary Inputs

Do not pass fake values into real operations just to make code type-check. If an input is required, the operation should only be built or executed when the real input exists.

The query must not be built with `"missing"` as a real route parameter. `enabled` is not input validation.

Do not replace this with a handmade skipped query either. That mixes a real API-owned query contract with an invented cache key for an operation that does not exist yet.

## Why This Is Wrong

- It lets an invalid value cross an API, database, filesystem, command, cache, or stream boundary.
- It creates cache keys, logs, traces, URLs, or commands for a value that is not a real domain value.
- It can run later through refetches, invalidations, option reuse, race conditions, or future edits that change the guard.
- It hides nullability instead of making the not-ready state explicit.
- It trains the codebase to treat placeholders as legitimate IDs.
- It can invent cache state for absence, making "not selected yet" look like a backend query state.

## Required Direction

- Guard before the boundary. Do not build request/query/command options with fake inputs.
- Prefer splitting the component or hook boundary so the operation only exists where the required input is non-null.
- Represent the not-ready state explicitly in UI/control flow until the required input is real.
- Keep real domain inputs real. Do not invent `"missing"`, `"unknown"`, `"none"`, `"null"`, `""`, `0`, or dummy UUIDs unless that value is an actual API contract.
- If the call shape makes guarding hard, improve the boundary or split the component/helper so the required input is non-null where the operation is created.
- If a fallback value is genuinely valid business behavior, name it as policy and keep it at the domain boundary. Do not smuggle it in as a type workaround.

## Review Question

Would this code still be correct if the disabled flag, early return, or caller guard disappeared tomorrow? If not, the invalid input is too close to the real operation.
