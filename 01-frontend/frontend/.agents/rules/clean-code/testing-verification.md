# Testing and Verification

Use when code changes tests, bug fixes, risky behavior, mocks, assertions, or test placement.

## Rules

- Add or update tests when a change protects behavior likely to regress: bug fixes, branching logic, state transitions, async mutations, data transforms, schema validation, URL/search parsing, permission/security checks, accessibility contracts, generated API boundaries, or TanStack DB collection behavior.
- Bug fixes should add or update a regression test that would have failed before the fix, covering the user-visible behavior or business outcome rather than only the changed implementation detail.
- Do not add tests only for trivial wrappers, static copy, pass-through props, CSS classes, icon choices, one-line constants, or render-only smoke checks. Use type-checking, linting, or browser verification for those when that gives better signal.
- Useful tests are durable handoff specs for future agents: they explain the product/domain guarantee, not the component tree choreography.
- Prefer a focused test around the riskiest behavior over broad mock-heavy coverage that mostly restates implementation.
- Assertions must verify specific values, state changes, calls with meaningful arguments, or user-visible output. Avoid truthy-only, render-only, or no-crash assertions.
- Keep test files near the code they verify and match the source filename/location. Prefer updating the nearest existing test before creating detached tests elsewhere.
- If risky behavior is intentionally left without tests, record the reason and the chosen non-test verification path in task/review notes.

## Report When

Report bug fixes without failing-before coverage, tests that would pass before the change, shallow assertions, mock-heavy tests with no behavioral guarantee, detached test placement, or missing verification notes for risky untested behavior.

## Human Triage Suggestion

Suggest one focused behavior assertion, a regression test from the bug story, moving the test next to the source, deleting a trivial smoke test, or documenting the non-test verification path.
