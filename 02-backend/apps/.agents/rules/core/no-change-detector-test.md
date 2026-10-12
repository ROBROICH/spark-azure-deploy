---
name: no-change-detector-test
description: >-
  Use when adding, editing, or reviewing tests, especially *.test.ts or any
  assertion coupled to implementation details instead of behavior. Enforces
  assertion-by-assertion review: keep real contracts, trim change-detector
  assertions, and replace them with structural or observable behavior checks.
---

# No Change-Detector Tests

**OWNER RULE: change-detector tests are banned — deleting one is a fix, not
lost coverage, and reviewers report one as a finding, not a nit.**

A good assertion proves a product, protocol, persistence, security, or
integration contract. A weak assertion is a change detector: it repeats,
derives from, or over-specifies the same implementation detail under test, so
the test and implementation must move in lockstep even when no observable
behavior changed. If editing behavior forces the assertion to move in
lockstep, the test is the defect — delete it or rewrite it against the
observable contract.

Do not add tests unless the user explicitly asked for tests or new coverage is
needed to preserve real behavior while editing existing tests.

## Review Workflow

Start with any user-named test file, then widen only as needed. Read the test
and enough implementation to know whether each assertion has an independent
expected behavior, pins an implementation detail, preserves fixture/user input,
or checks an external contract.

For each assertion, classify it explicitly:

- `keep`: proves behavior or a stable contract.
- `trim`: is a change detector that proves nothing beyond the implementation
  detail it is coupled to.
- `replace`: should become a structural assertion over commands, options,
  payload shape, status, persistence, schema fields, or parsed data.

Do not use grep as the review. Grep can find candidates, but manually inspect
the assertion and its surrounding setup before editing.

## Keep

- User input, fixture input, or external input is preserved, parsed, rejected,
  or transformed as intended.
- API status codes, response shapes, query strings, redirects, and
  machine-readable error codes.
- Auth, ownership, role checks, token binding, session handling, redaction,
  secret absence, and other security boundaries.
- Durable effects such as database rows, task status, and cleanup of external
  resources.
- External client payloads at the real boundary.
- Parser/transducer output when the expected value comes from the input event
  or fixture being parsed.
- Operator-facing error text when the exact message is the route/runtime
  contract being exercised.
- Host probe HTTP: `GET /healthz`, `GET /ready`, `GET /startup` status and
  body. That is the operational contract. Do not pin the rest of `app.routes`.

## Trim

- Exact `app.routes` inventories, `operationId` lists, `package.json`
  dependency pins, or other composition snapshots that break when a host
  capability is added.
- Source-authored prose, headings, descriptions, labels, or explanatory text
  that is not itself the contract.
- Internal call order, helper names, component structure, private state, mock
  interactions, or object snapshots that describe how the code got a result
  rather than the result or boundary contract.
- Generated strings, fallback values, or derived fields whose presence is
  already implied by a stronger assertion.
- Oversized object checks that pin unrelated fields while the test is about a
  narrower contract.

The core smell is lockstep coupling: if a legitimate implementation-only
change would require updating the assertion and there is no independent user,
API, security, persistence, protocol, or integration contract being protected,
the assertion is fluff.

## Replace

Prefer the smallest stable surface that proves behavior: command definitions,
payload fields, status codes, persisted rows, parsed values, selected
options, state transitions, or absence of leakage.

If the pinned detail is not the contract, replace it with the underlying
signal. If it is the contract, keep it and name why.

## Completion

When reporting a test review, include:

- Exact files changed.
- Assertion-by-assertion summary for changed files.
- Any high-risk assertions intentionally kept and why.
- Validation commands and results.
