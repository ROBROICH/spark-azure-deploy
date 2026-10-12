import { describe, expect, test } from "bun:test";

import readTemporalOutcomes from "../fixtures/temporal-outcomes.json";
import runtimeOutcomes from "../fixtures/temporal-runtime-outcomes.json";

const runtimeCatalogFile = Bun.file(
  new URL("../fixtures/temporal-runtime-outcomes.json", import.meta.url),
);
async function runtimeFixtures() {
  expect(await runtimeCatalogFile.exists()).toBeTrue();
  return runtimeOutcomes.fixtures;
}

describe("Document Management Temporal runtime fixture profile", () => {
  test("keeps the frozen read catalog empty and owns a separate non-empty endpoint catalog", async () => {
    expect(readTemporalOutcomes).toEqual({ fixtures: [] });

    const fixtures = await runtimeFixtures();
    expect(
      fixtures.map(({ name, operation, outcome }) => ({
        name,
        operation,
        outcome: outcome.kind,
        errorKind: outcome.error?.kind ?? null,
      })),
    ).toEqual([
      {
        name: "zip-processing-running",
        operation: "document-management.file-processing.start-and-describe",
        outcome: "return",
        errorKind: null,
      },
      {
        name: "zip-processing-already-started",
        operation: "document-management.file-processing.start-and-describe",
        outcome: "throw",
        errorKind: "already_started",
      },
      {
        name: "single-processing-already-started",
        operation: "document-management.file-processing.start-and-describe",
        outcome: "throw",
        errorKind: "already_started",
      },
      {
        name: "approval-created-version",
        operation: "document-management.project-version-approval.start-and-result",
        outcome: "return",
        errorKind: null,
      },
      {
        name: "approval-completed-without-version",
        operation: "document-management.project-version-approval.start-and-result",
        outcome: "return",
        errorKind: null,
      },
      {
        name: "approval-temporal-failure",
        operation: "document-management.project-version-approval.start-and-result",
        outcome: "throw",
        errorKind: "operation_failed",
      },
      {
        name: "cancel-processing",
        operation: "document-management.file-processing.cancel",
        outcome: "return",
        errorKind: null,
      },
      {
        name: "cancel-processing-failure",
        operation: "document-management.file-processing.cancel",
        outcome: "throw",
        errorKind: "operation_failed",
      },
    ]);

    const exactSelectors = fixtures.map(({ operation, input }) =>
      JSON.stringify([operation, input]),
    );
    expect(new Set(exactSelectors).size).toBe(fixtures.length);
    for (const fixture of fixtures.filter(
      ({ operation }) => operation === "document-management.file-processing.start-and-describe",
    )) {
      expect(fixture.input).toMatchObject({
        request: { taskQueue: "dms" },
      });
    }
    for (const fixture of fixtures.filter(
      ({ operation }) =>
        operation === "document-management.project-version-approval.start-and-result",
    )) {
      expect(fixture.input).toMatchObject({
        taskQueue: "project_logic_service",
      });
    }

    const zipAlreadyStarted = fixtures[1]!;
    expect(zipAlreadyStarted.input).toMatchObject({
      request: {
        kind: "zip",
        workflowName: "FileProcessingWorkflow",
        idReusePolicy: "REJECT_DUPLICATE",
        idConflictPolicy: "USE_EXISTING",
      },
    });
    expect(fixtures[3]!.outcome).toEqual({ kind: "return", value: { newVersion: 10 } });
    expect(fixtures[4]!.outcome).toEqual({ kind: "return", value: { newVersion: null } });
    expect(fixtures[6]!.outcome).toMatchObject({
      kind: "return",
      value: { cancelled: true },
    });
  });
});
