import { describe, expect, test } from "bun:test";
import { ActivityFailure, RetryState, TimeoutFailure, TimeoutType } from "@temporalio/common";

import type {
  DmsSingleFileProcessingInput,
  DmsZipFileProcessingInput,
  DmsWorkflowRuntime,
  FileDiffResult,
  SingleFileResult,
} from "../src/temporal/contracts.ts";
import {
  runFileProcessingWorkflow,
  runSingleFileProcessingWorkflow,
} from "../src/temporal/workflow-logic.ts";

const zipInput = (fileType: "zip" | "ewms_zip" = "zip"): DmsZipFileProcessingInput => ({
  fileId: "10000000-0000-4000-8000-000000000001",
  filename: "basis.zip",
  projectId: "20000000-0000-4000-8000-000000000002",
  fileType: fileType,
  zipPath: "zips/basis.zip",
  entryFileType: fileType === "ewms_zip" ? "ewms_document" : "document",
  sourceProjectVersion: 3,
  workflowActor: null,
});

const singleInput = (): DmsSingleFileProcessingInput => ({
  fileId: "30000000-0000-4000-8000-000000000003",
  bucketPath: "documents/report.pdf",
  filename: "report.pdf",
  fileType: "document",
  projectId: "20000000-0000-4000-8000-000000000002",
  workflowActor: null,
});

function runtime(overrides: Partial<DmsWorkflowRuntime> = {}) {
  const calls: Array<{ name: string; input: unknown }> = [];
  const sources = new Set([zipInput().zipPath]);
  const extracted: SingleFileResult[] = [
    {
      success: true,
      filename: "report.pdf",
      bucketPath: "tmp/report.pdf",
      action: "UNZIP",
      fileId: null,
      errorCode: null,
      errorMessage: null,
    },
  ];
  const diff: FileDiffResult = {
    new: [{ filename: "report.pdf", bucketPath: "tmp/report.pdf", sha: "sha-new" }],
    deleted: [],
    changed: [],
    renamed: [],
    unchanged: [],
    duplicate: [],
  };
  const base: DmsWorkflowRuntime = {
    async validateZip(input) {
      calls.push({ name: "validate_zip", input });
      return { ok: true, value: { entryCount: 1, totalUncompressedSize: 12 } };
    },
    async extractZip(input) {
      calls.push({ name: "extract_zip", input });
      if (!sources.has(input.zipPath)) {
        return {
          ok: false,
          failure: { code: "ZIP_NOT_FOUND", message: "Zip file not found in storage" },
        };
      }
      return { ok: true, value: extracted };
    },
    async deleteZipSource(input) {
      sources.delete(input.zipPath);
    },
    async createDiff(input) {
      calls.push({ name: "create_diff", input });
      return diff;
    },
    async ingestFile(input) {
      calls.push({ name: "ingest_file", input });
      return {
        ...extracted[0]!,
        fileId: "40000000-0000-4000-8000-000000000004",
        action: "INGEST",
      };
    },
    async renameFile(input) {
      calls.push({ name: "rename_file", input });
      return {
        ...extracted[0]!,
        fileId: input.fileId,
        filename: input.newName,
        action: "RENAME",
      };
    },
    async persistZipDiff(input) {
      calls.push({ name: "persist_zip_diff", input });
    },
    async updateZipStatus(input) {
      calls.push({ name: "update_file_status", input });
    },
    async updateFileStatus(input) {
      calls.push({ name: "update_file_workflow_status", input });
    },
    async updateZipApprovalStatus(input) {
      calls.push({ name: "update_zip_approval_status", input });
    },
    async scanAndUpload(input) {
      calls.push({ name: "scan_and_upload", input });
    },
    async createProjectVersion(input) {
      calls.push({ name: "CreateProjectVersionWorkflow", input });
      return 4;
    },
    async startEwms(input) {
      calls.push({ name: "EWMSOrchestratorWorkflow", input });
    },
    isCancellation: () => false,
    ...overrides,
  };
  return { calls, runtime: base, diff, extracted, sources };
}

describe("DMS service-owned workflow behavior", () => {
  test("commits a first regular ZIP through project versioning without direct ingest", async () => {
    const harness = runtime();

    const result = await runFileProcessingWorkflow(zipInput(), harness.runtime, {
      approvalEnabled: true,
    });

    expect(result).toEqual({
      successful: [{ fileId: null, filename: "report.pdf", action: "INGEST" }],
      failed: [],
      summary: { total: 1, succeeded: 1, failed: 0 },
      status: "APPROVED",
    });
    expect(
      harness.calls.find(({ name }) => name === "CreateProjectVersionWorkflow")?.input,
    ).toMatchObject({ projectId: zipInput().projectId, zipFileId: zipInput().fileId });
    expect(harness.calls.some(({ name }) => name === "ingest_file")).toBe(false);
    expect(harness.sources.has(zipInput().zipPath)).toBe(false);
  });

  test("pauses an existing regular ZIP diff for approval", async () => {
    const harness = runtime({
      async createDiff() {
        return {
          ...harness.diff,
          new: [],
          unchanged: [
            {
              fileId: "50000000-0000-4000-8000-000000000005",
              filename: "report.pdf",
              sha: "same",
            },
          ],
        };
      },
    });

    const result = await runFileProcessingWorkflow(zipInput(), harness.runtime, {
      approvalEnabled: true,
    });

    expect(result).toEqual({
      successful: [],
      failed: [],
      summary: { total: 0, succeeded: 0, failed: 0 },
      status: "PENDING",
    });
    expect(harness.calls.find(({ name }) => name === "persist_zip_diff")?.input).toMatchObject({
      zipFileId: zipInput().fileId,
      sourceProjectVersion: 3,
    });
    expect(harness.calls.find(({ name }) => name === "update_zip_approval_status")?.input).toEqual({
      zipFileId: zipInput().fileId,
      status: "REQUIRES_APPROVAL",
    });
    expect(harness.sources.has(zipInput().zipPath)).toBe(false);
  });

  test("ingests EWMS entries in place and starts the orchestration child only for successes", async () => {
    const harness = runtime();

    const result = await runFileProcessingWorkflow(zipInput("ewms_zip"), harness.runtime, {
      approvalEnabled: true,
    });

    expect(result.status).toBe("APPROVED");
    expect(harness.calls.find(({ name }) => name === "EWMSOrchestratorWorkflow")?.input).toEqual({
      projectId: zipInput("ewms_zip").projectId,
      fileIds: ["40000000-0000-4000-8000-000000000004"],
      projectVersion: 3,
    });
  });

  test.each(["APPROVED", "PENDING"] as const)(
    "retains a retryable ZIP until the %s result is durably completed",
    async (status) => {
      const failure = new Error("completion was not persisted");
      let failCompletion = true;
      const completionRequested = Promise.withResolvers<void>();
      const completion = Promise.withResolvers<void>();
      const harness = runtime({
        async createDiff() {
          return status === "PENDING"
            ? {
                ...harness.diff,
                unchanged: [
                  {
                    fileId: "50000000-0000-4000-8000-000000000005",
                    filename: "previous.pdf",
                    sha: "same",
                  },
                ],
              }
            : harness.diff;
        },
        async updateZipStatus(input) {
          if (input.status !== "COMPLETED") return;
          if (failCompletion) throw failure;
          completionRequested.resolve();
          await completion.promise;
        },
      });

      await expect(
        runFileProcessingWorkflow(zipInput(), harness.runtime, {
          approvalEnabled: true,
        }),
      ).rejects.toBe(failure);
      expect(harness.sources.has(zipInput().zipPath)).toBe(true);

      failCompletion = false;
      const retry = runFileProcessingWorkflow(zipInput(), harness.runtime, {
        approvalEnabled: true,
      });
      await completionRequested.promise;
      const sourceAvailableBeforeCompletion = harness.sources.has(zipInput().zipPath);
      completion.resolve();
      expect((await retry).status).toBe(status);
      expect(sourceAvailableBeforeCompletion).toBe(true);
      expect(harness.sources.has(zipInput().zipPath)).toBe(false);
    },
  );

  test("marks ZIP failures and single-file cancellation at their incumbent fallback states", async () => {
    const zipFailure = new Error("extract failed");
    const zipHarness = runtime({
      async extractZip() {
        throw zipFailure;
      },
    });
    expect(
      await runFileProcessingWorkflow(zipInput(), zipHarness.runtime, {
        approvalEnabled: false,
      }).catch((error) => error),
    ).toBe(zipFailure);
    expect(zipHarness.sources.has(zipInput().zipPath)).toBe(true);
    expect(zipHarness.calls.at(-1)).toEqual({
      name: "update_file_status",
      input: {
        zipFileId: zipInput().fileId,
        status: "FAILED",
        workflowFailureCode: "PROCESSING_FAILED",
      },
    });

    const cancellation = new Error("cancelled");
    const singleHarness = runtime({
      async scanAndUpload() {
        throw cancellation;
      },
      isCancellation: (error) => error === cancellation,
    });
    expect(
      await runSingleFileProcessingWorkflow(singleInput(), singleHarness.runtime).catch(
        (error) => error,
      ),
    ).toBe(cancellation);
    expect(singleHarness.calls.at(-1)).toEqual({
      name: "update_file_workflow_status",
      input: { fileId: singleInput().fileId, status: "CANCELED" },
    });
  });

  test("fails an extraction-result failure without completing the ZIP", async () => {
    const harness = runtime();
    const input = { ...zipInput(), zipPath: "" };

    expect(
      await runFileProcessingWorkflow(input, harness.runtime, {
        approvalEnabled: false,
      }).catch((error) => error),
    ).toMatchObject({ type: "ZIP_NOT_FOUND", nonRetryable: true });
    expect(harness.calls.at(-1)).toEqual({
      name: "update_file_status",
      input: {
        zipFileId: input.fileId,
        status: "FAILED",
        workflowFailureCode: "ZIP_NOT_FOUND",
      },
    });
  });

  test("persists the ZIP failure an extraction returns", async () => {
    const harness = runtime({
      async extractZip() {
        return {
          ok: false,
          failure: {
            code: "NO_PROCESSABLE_FILES",
            message:
              "ZIP contains no processable PDF files (INVALID_FILENAME, UNSUPPORTED_FILETYPE)",
          },
        };
      },
    });

    expect(
      await runFileProcessingWorkflow(zipInput(), harness.runtime, {
        approvalEnabled: false,
      }).catch((error) => error),
    ).toMatchObject({ type: "NO_PROCESSABLE_FILES", nonRetryable: true });
    expect(harness.calls.at(-1)).toEqual({
      name: "update_file_status",
      input: {
        zipFileId: zipInput().fileId,
        status: "FAILED",
        workflowFailureCode: "NO_PROCESSABLE_FILES",
      },
    });
    expect(harness.sources.has(zipInput().zipPath)).toBe(true);
  });

  test("persists the ZIP failure a validation returns", async () => {
    const harness = runtime({
      async validateZip() {
        return { ok: false, failure: { code: "ZIP_AMBIGUOUS", message: "ZIP file is ambiguous" } };
      },
    });

    expect(
      await runFileProcessingWorkflow(zipInput(), harness.runtime, {
        approvalEnabled: false,
      }).catch((error) => error),
    ).toMatchObject({
      type: "ZIP_AMBIGUOUS",
      message: "ZIP file is ambiguous",
      nonRetryable: true,
    });
    expect(harness.calls.at(-1)).toEqual({
      name: "update_file_status",
      input: {
        zipFileId: zipInput().fileId,
        status: "FAILED",
        workflowFailureCode: "ZIP_AMBIGUOUS",
      },
    });
    expect(harness.sources.has(zipInput().zipPath)).toBe(true);
  });

  test("maps Temporal activity timeouts onto PROCESSING_TIMED_OUT", async () => {
    const timeout = new TimeoutFailure("Activity timed out", null, TimeoutType.START_TO_CLOSE);
    const activityFailure = new ActivityFailure(
      "Activity task failed",
      "extractZip",
      "3",
      RetryState.TIMEOUT,
      "worker",
      timeout,
    );
    const harness = runtime({
      async extractZip() {
        throw activityFailure;
      },
    });

    expect(
      await runFileProcessingWorkflow(zipInput(), harness.runtime, {
        approvalEnabled: false,
      }).catch((error) => error),
    ).toBe(activityFailure);
    expect(harness.calls.at(-1)).toEqual({
      name: "update_file_status",
      input: {
        zipFileId: zipInput().fileId,
        status: "FAILED",
        workflowFailureCode: "PROCESSING_TIMED_OUT",
      },
    });
    expect(harness.sources.has(zipInput().zipPath)).toBe(true);
  });
});
