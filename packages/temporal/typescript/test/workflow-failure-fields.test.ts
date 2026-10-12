import { expect, test } from "bun:test";
import type { WorkflowFailureBranch } from "@spark-temporal/contracts";
import { ApplicationFailure } from "@temporalio/common";

import { failureFields } from "../src/workflow-interceptors.ts";

const branches: WorkflowFailureBranch[] = [
  { branch: "formalpruefung", errorCode: "ANALYSIS_TIMED_OUT" },
];

test("a catalog-typed failure reports its code and failed branches", () => {
  const failure = ApplicationFailure.create({
    message: "FVPWorkflow failed",
    type: "ANALYSIS_FAILED",
    nonRetryable: true,
    details: [{ schemaVersion: 1, branches }],
  });
  expect(failureFields(failure)).toEqual({ failureCode: "ANALYSIS_FAILED", failureBranches: branches });
});

test("a catalog-typed failure without valid details reports no branches", () => {
  expect(
    failureFields(ApplicationFailure.create({ message: "none", type: "NO_DOCUMENTS" })),
  ).toEqual({ failureCode: "NO_DOCUMENTS", failureBranches: null });
  expect(
    failureFields(
      ApplicationFailure.create({
        message: "bad",
        type: "ANALYSIS_FAILED",
        details: [{ schemaVersion: 1, branches: [{ branch: "x", errorCode: "BOOM" }] }],
      }),
    ),
  ).toEqual({ failureCode: "ANALYSIS_FAILED", failureBranches: null });
});

test("an untyped or foreign failure reports no failure code", () => {
  expect(failureFields(new Error("boom"))).toEqual({});
  expect(failureFields(ApplicationFailure.nonRetryable("untyped"))).toEqual({});
  expect(failureFields(ApplicationFailure.create({ message: "x", type: "SomeInternalError" }))).toEqual(
    {},
  );
});
