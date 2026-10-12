---
ruleId: clean-code/testing-verification
---

# Testing and Verification

Use when code changes tests, bug fixes, risky behavior, mocks, assertions, or test placement.

## Rules

- Default to few, high-value tests, not coverage growth. Each permanent test must protect a concrete, relevant behavior against a plausible regression.
- Name that regression before adding a test. Branches, hooks, async code, and changed files do not by themselves justify tests.
- Do not cover every unlikely edge case or input combination. Cover rare cases only when concrete evidence or serious security/data-loss impact warrants them.
- For bug fixes, reproduce the defect before changing production code and verify the same scenario afterward. Preserve mandatory workflow RED/GREEN gates.
- Prefer one focused regression test for a real defect. Otherwise use browser verification, an existing check, or a throwaway smoke script when sufficient.
- Assert independently expected user-visible outcomes or stable product, API, security, or persistence contracts. Do not reimplement production logic to calculate expectations.
- Change-detector tests are defects: implementation-only refactors must not require assertion changes when the observable contract stays unchanged.
- Remove assertions that only pin internal call order, helper names, component structure, private state, mock echoes, or oversized snapshots.
- Do not test static copy, CSS classes, icons, constants, prop forwarding, or route/component inventories unless that detail is itself a required contract.
- Review assertions as keep, trim, or replace. Delete redundant change detectors instead of updating them to match the new implementation.
- Prefer the nearest existing test and the smallest stable behavioral surface. Avoid mock-heavy setup and duplicate coverage across layers.
- Record the exercised verification path and any material residual risk. Fewer tests never means skipping verification.

## Report When

Report change detectors and tests without a credible behavioral guarantee as defects, not style preferences.
Request missing coverage only for a named plausible regression with material impact and inadequate existing verification.
Do not report test counts, coverage percentages, or speculative edge cases as findings. Keep required bug-fix RED/GREEN evidence.

## Human Triage Suggestion

Suggest deleting redundant assertions, replacing a change detector with one focused behavior check, or using an adequate non-test verification path.
