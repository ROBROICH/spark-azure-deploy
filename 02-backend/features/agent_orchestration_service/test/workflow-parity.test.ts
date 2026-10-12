import { describe, expect, test } from "bun:test";
import {
  ApplicationFailure,
  CancelledFailure,
  ChildWorkflowFailure,
  RetryState,
  TerminatedFailure,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";

import {
  ACTIVITY_OPTIONS,
  NODE_VERSION_CONFLICT_TYPE,
  WORKFLOW_RESULT_LABELS,
  failedResultItem,
  isolatedFvpResultItems,
  settledResultItem,
  workflowFailureDetails,
} from "../src/temporal/workflow-contracts.ts";
import { ASSESSMENT_ACTIVITY_OPTIONS } from "../src/temporal/assessment-contracts.ts";

describe("AOS incumbent workflow scheduling parity", () => {
  test("preserves the remaining first-slice scheduling policies", () => {
    expect(ACTIVITY_OPTIONS).toEqual({
      default: {
        startToCloseTimeout: "1 minute",
        retry: {
          maximumAttempts: 3,
          maximumInterval: "1 minute",
          nonRetryableErrorTypes: [NODE_VERSION_CONFLICT_TYPE],
        },
      },
      fppDownload: {
        startToCloseTimeout: "10 minutes",
        retry: { maximumAttempts: 5, maximumInterval: "5 seconds" },
      },
      resultDelivery: {
        startToCloseTimeout: "10 minutes",
        retry: { maximumAttempts: 5, maximumInterval: "1 minute" },
      },
      extractionWrite: {
        startToCloseTimeout: "30 minutes",
        retry: {
          initialInterval: "3 seconds",
          backoffCoefficient: 2,
          maximumInterval: "30 seconds",
        },
      },
    });
  });

  test("keeps source-specific Bewertung, EWMS, and risk peer policies", () => {
    expect(ASSESSMENT_ACTIVITY_OPTIONS).toEqual({
      bewertungGather: {
        startToCloseTimeout: "10 minutes",
        retry: { maximumAttempts: 5, maximumInterval: "1 minute" },
      },
      bewertungSuz: {
        startToCloseTimeout: "12 hours",
        heartbeatTimeout: "120 seconds",
      },
      bewertungWrite: {
        startToCloseTimeout: "30 seconds",
        retry: { initialInterval: "2 seconds", maximumInterval: "10 seconds" },
      },
      ewmsPeer: {
        startToCloseTimeout: "60 seconds",
        retry: {
          initialInterval: "2 seconds",
          backoffCoefficient: 2,
          maximumInterval: "30 seconds",
          maximumAttempts: 30,
        },
      },
      riskPeer: {
        startToCloseTimeout: "60 seconds",
        retry: {
          initialInterval: "2 seconds",
          backoffCoefficient: 2,
          maximumInterval: "30 seconds",
          nonRetryableErrorTypes: [NODE_VERSION_CONFLICT_TYPE],
        },
      },
    });
  });

  test("emits the incumbent labels in deterministic isolated-FVP order", () => {
    const result = isolatedFvpResultItems({
      contentExtraction: {
        workflowType: WORKFLOW_RESULT_LABELS.contentExtraction,
        result: { content: true },
        error: null,
        errorCode: null,
      },
      formalCompleteness: {
        workflowType: WORKFLOW_RESULT_LABELS.formalCompleteness,
        result: { formal: true },
        error: null,
        errorCode: null,
      },
      plausibility: {
        workflowType: WORKFLOW_RESULT_LABELS.plausibility,
        result: { plausible: true },
        error: null,
        errorCode: null,
      },
      tableOfContents: {
        workflowType: WORKFLOW_RESULT_LABELS.tableOfContents,
        result: { toc: true },
        error: null,
        errorCode: null,
      },
    });

    expect(result.map(({ workflowType }) => workflowType)).toEqual([
      "inhaltsextraktion",
      "formalpruefung",
      "plausibilitaetspruefung",
      "inhaltsverzeichnismatching",
    ]);
  });

  test("rethrows plausibility cancellation only when the production FVP path opts in", () => {
    const cancellation = new Error("cancelled");
    let thrown: unknown;
    try {
      settledResultItem(
        WORKFLOW_RESULT_LABELS.plausibility,
        { status: "rejected", reason: cancellation },
        (reason) => reason === cancellation,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(cancellation);
  });
});

const childFailure = (cause: Error) =>
  new ChildWorkflowFailure(
    "default",
    { workflowId: "child", runId: "run" },
    "ChildWorkflow",
    RetryState.NON_RETRYABLE_FAILURE,
    cause,
  );

const rejected = (reason: Error) =>
  settledResultItem(WORKFLOW_RESULT_LABELS.formalCompleteness, { status: "rejected", reason });

describe("FVP branch failure codes", () => {
  test("a module that failed with an application error gives ANALYSIS_FAILED", () => {
    const item = rejected(childFailure(ApplicationFailure.nonRetryable("module broke")));
    expect(item).toMatchObject({
      workflowType: "formalpruefung",
      result: null,
      errorCode: "ANALYSIS_FAILED",
    });
    expect(item.error).toBe("module broke");
  });

  test("a timed-out child gives ANALYSIS_TIMED_OUT", () => {
    const timeout = new TimeoutFailure("timed out", undefined, TimeoutType.START_TO_CLOSE);
    expect(rejected(childFailure(timeout)).errorCode).toBe("ANALYSIS_TIMED_OUT");
  });

  test("a canceled or terminated child gives ANALYSIS_CANCELED", () => {
    expect(rejected(childFailure(new CancelledFailure("canceled"))).errorCode).toBe(
      "ANALYSIS_CANCELED",
    );
    expect(rejected(childFailure(new TerminatedFailure("terminated"))).errorCode).toBe(
      "ANALYSIS_CANCELED",
    );
  });

  test("an unrelated rejection gives ANALYSIS_FAILED", () => {
    expect(rejected(new Error("boom")).errorCode).toBe("ANALYSIS_FAILED");
    expect(
      settledResultItem(WORKFLOW_RESULT_LABELS.plausibility, {
        status: "rejected",
        reason: "not an error",
      }),
    ).toMatchObject({ error: "not an error", errorCode: "ANALYSIS_FAILED" });
  });

  test("a fulfilled branch carries no error code", () => {
    expect(
      settledResultItem(WORKFLOW_RESULT_LABELS.plausibility, {
        status: "fulfilled",
        value: { plausible: true },
      }),
    ).toEqual({
      workflowType: "plausibilitaetspruefung",
      result: { plausible: true },
      error: null,
      errorCode: null,
    });
  });

  test("the details payload names each failed branch once and skips succeeded ones", () => {
    const timeout = new TimeoutFailure("timed out", undefined, TimeoutType.START_TO_CLOSE);
    expect(
      workflowFailureDetails([
        failedResultItem(WORKFLOW_RESULT_LABELS.contentExtraction, childFailure(timeout)),
        failedResultItem(WORKFLOW_RESULT_LABELS.contentExtraction, new Error("vector store")),
        settledResultItem(WORKFLOW_RESULT_LABELS.plausibility, {
          status: "fulfilled",
          value: { plausible: true },
        }),
        rejected(new Error("boom")),
      ]),
    ).toEqual({
      schemaVersion: 1,
      branches: [
        { branch: "inhaltsextraktion", errorCode: "ANALYSIS_TIMED_OUT" },
        { branch: "formalpruefung", errorCode: "ANALYSIS_FAILED" },
      ],
    });
  });
});
