import { describe, expect, test } from "bun:test";

import {
  NORM_ACTIVITY_OPTIONS,
  NORM_CHILD_OPTIONS,
  NORM_LIMITS,
} from "../src/temporal/norm-contracts.ts";

const normWorkflows = [
  "MVPWorkflow",
  "BatchMVPWorkflow",
  "InsertRechtsmethodikResultsWorkflow",
  "suche_zuordnung_norm",
  "InsertSucheZuordnungResultsWorkflow",
] as const;

describe("AOS source-corrected norm runtime inventory", () => {
  test("exports the five norm workflow implementations", async () => {
    const workflows = await import("../src/temporal/workflows.ts");
    for (const name of normWorkflows)
      expect(workflows[name]).toBeInstanceOf(Function);
  });

  test("keeps source-specific activity, child, and concurrency policies", () => {
    expect(NORM_ACTIVITY_OPTIONS).toEqual({
      mvpCacheRead: { startToCloseTimeout: "30 seconds" },
      mvpCacheSave: {
        startToCloseTimeout: "30 seconds",
        retry: { maximumAttempts: 20 },
      },
      batchFetchNorms: {
        startToCloseTimeout: "5 minutes",
        retry: { maximumAttempts: 3 },
      },
      batchCachedNorms: { startToCloseTimeout: "30 minutes" },
      rechtsmethodikTopicFetch: {
        startToCloseTimeout: "30 seconds",
        retry: { initialInterval: "2 seconds", maximumInterval: "10 seconds" },
      },
      rechtsmethodikContextFetch: {
        startToCloseTimeout: "5 minutes",
        retry: { initialInterval: "2 seconds", maximumInterval: "10 seconds" },
      },
      rechtsmethodikWrite: {
        startToCloseTimeout: "30 seconds",
        retry: { maximumAttempts: 1 },
      },
      suzDocumentFetch: {
        startToCloseTimeout: "10 minutes",
        heartbeatTimeout: "2 minutes",
        retry: {
          maximumAttempts: 3,
          initialInterval: "10 seconds",
          backoffCoefficient: 2,
        },
      },
      suzGraphFetch: {
        startToCloseTimeout: "5 minutes",
        heartbeatTimeout: "2 minutes",
        retry: {
          maximumAttempts: 3,
          initialInterval: "10 seconds",
          backoffCoefficient: 2,
        },
      },
      suzResultPeer: {
        startToCloseTimeout: "30 seconds",
        retry: { initialInterval: "2 seconds", maximumInterval: "10 seconds" },
      },
    });
    expect(NORM_CHILD_OPTIONS).toEqual({
      rechtsmethodik: {
        workflowExecutionTimeout: "6 hours",
        workflowTaskTimeout: "60 seconds",
      },
      batchMvp: {
        workflowExecutionTimeout: "12 hours",
        workflowTaskTimeout: "60 seconds",
        retry: { maximumAttempts: 2 },
      },
      satz: {
        workflowExecutionTimeout: "6 hours",
        workflowTaskTimeout: "60 seconds",
        retry: { maximumAttempts: 2 },
      },
      suzInsert: {
        workflowExecutionTimeout: "2 hours",
        workflowTaskTimeout: "60 seconds",
        retry: { maximumAttempts: 10 },
      },
    });
    expect(NORM_LIMITS).toEqual({
      batchMvp: 5,
      satzChildren: 8,
      pageIndex: 2,
      resultInsertion: 10,
      rechtsmethodikReconcileAttempts: 5,
      rechtsmethodikReconcileDelay: "2 seconds",
    });
  });
});
