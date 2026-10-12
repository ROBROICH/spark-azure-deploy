import { expect, test } from "bun:test";

import { Value, WorkflowFailureDetailsSchema, workflowFailureCodes } from "../src/index.js";

test("workflow failure codes are unique upper snake case", () => {
  expect(new Set(workflowFailureCodes).size).toBe(workflowFailureCodes.length);
  for (const code of workflowFailureCodes) expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
});

test("workflow failure details accept catalog codes only", () => {
  expect(
    Value.Check(WorkflowFailureDetailsSchema, {
      schemaVersion: 1,
      branches: [{ branch: "formalpruefung", errorCode: "ANALYSIS_TIMED_OUT" }],
    }),
  ).toBe(true);
  expect(
    Value.Check(WorkflowFailureDetailsSchema, {
      schemaVersion: 1,
      branches: [{ branch: "formalpruefung", errorCode: "MODULE_EXPLODED" }],
    }),
  ).toBe(false);
});
