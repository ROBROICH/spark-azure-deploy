import {
  ActivityFailure,
  ApplicationFailure,
  ChildWorkflowFailure,
  TimeoutFailure,
} from "@temporalio/common";

import type {
  DmsSingleFileProcessingInput,
  DmsWorkflowRuntime,
  DmsZipFileProcessingInput,
  FileDiffResult,
  FileProcessingFailure,
  FileProcessingOutput,
  FileProcessingSuccess,
  SingleFileResult,
  UpdateZipStatusInput,
  ZipActivityResult,
} from "./contracts.ts";

const present = (diff: FileDiffResult): boolean =>
  diff.new.length > 0 ||
  diff.deleted.length > 0 ||
  diff.changed.length > 0 ||
  diff.renamed.length > 0 ||
  diff.unchanged.length > 0;

const requiresApproval = (
  input: DmsZipFileProcessingInput,
  diff: FileDiffResult,
  approvalEnabled: boolean,
): boolean =>
  approvalEnabled &&
  input.fileType !== "ewms_zip" &&
  (diff.deleted.length > 0 ||
    diff.changed.length > 0 ||
    diff.renamed.length > 0 ||
    diff.unchanged.length > 0);

const successesFromCommittedDiff = (diff: FileDiffResult): FileProcessingSuccess[] => [
  ...diff.new.map((item) => ({
    fileId: null,
    filename: item.filename,
    action: "INGEST",
  })),
  ...diff.changed.map((item) => ({
    fileId: item.fileId,
    filename: item.filename,
    action: "INGEST",
  })),
  ...diff.renamed.map((item) => ({
    fileId: item.fileId,
    filename: item.newName,
    action: "RENAME",
  })),
];

const failure = (result: SingleFileResult): FileProcessingFailure => ({
  filename: result.filename,
  action: result.action,
  errorCode: result.errorCode,
  errorMessage: result.errorMessage,
});

const partition = (results: readonly SingleFileResult[]) => ({
  successful: results
    .filter(({ success }) => success)
    .map(({ fileId, filename, action }) => ({
      fileId,
      filename,
      action,
    })),
  failed: results.filter(({ success }) => !success).map(failure),
});

const output = (
  successful: readonly FileProcessingSuccess[],
  failed: readonly FileProcessingFailure[],
  status: "PENDING" | "APPROVED",
): FileProcessingOutput => ({
  successful,
  failed,
  summary: {
    total: successful.length + failed.length,
    succeeded: successful.length,
    failed: failed.length,
  },
  status,
});

async function bestEffort(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {}
}

const isTimeout = (error: Error): boolean =>
  error instanceof TimeoutFailure ||
  ((error instanceof ActivityFailure || error instanceof ChildWorkflowFailure) &&
    error.cause instanceof TimeoutFailure);

const unexpectedFailure = (
  error: Error,
  runtime: DmsWorkflowRuntime,
): Pick<UpdateZipStatusInput, "status" | "workflowFailureCode"> => {
  if (runtime.isCancellation(error)) {
    return { status: "CANCELED", workflowFailureCode: "PROCESSING_CANCELED" };
  }
  return {
    status: "FAILED",
    workflowFailureCode: isTimeout(error) ? "PROCESSING_TIMED_OUT" : "PROCESSING_FAILED",
  };
};

async function extractZip(
  input: DmsZipFileProcessingInput,
  runtime: DmsWorkflowRuntime,
): Promise<ZipActivityResult<SingleFileResult[]>> {
  if (input.zipPath.length === 0) {
    return {
      ok: false,
      failure: { code: "ZIP_NOT_FOUND", message: "Zip file not found in storage" },
    };
  }
  const validation = await runtime.validateZip({
    zipPath: input.zipPath,
    filename: input.filename,
  });
  if (!validation.ok) return validation;
  return runtime.extractZip({
    zipFileId: input.fileId,
    filename: input.filename,
    projectId: input.projectId,
    zipPath: input.zipPath,
    fileType: input.fileType,
  });
}

export async function runFileProcessingWorkflow(
  input: DmsZipFileProcessingInput,
  runtime: DmsWorkflowRuntime,
  options: { readonly approvalEnabled: boolean },
): Promise<FileProcessingOutput> {
  await runtime.updateZipStatus({ zipFileId: input.fileId, status: "RUNNING" });
  let processed: ZipActivityResult<FileProcessingOutput>;
  try {
    processed = await processZip(input, runtime, options);
  } catch (error) {
    await bestEffort(() =>
      runtime.updateZipStatus({
        zipFileId: input.fileId,
        ...(error instanceof Error
          ? unexpectedFailure(error, runtime)
          : { status: "FAILED", workflowFailureCode: "PROCESSING_FAILED" }),
      }),
    );
    throw error;
  }
  if (processed.ok) {
    await runtime.deleteZipSource({ zipPath: input.zipPath });
    return processed.value;
  }
  await bestEffort(() =>
    runtime.updateZipStatus({
      zipFileId: input.fileId,
      status: "FAILED",
      workflowFailureCode: processed.failure.code,
    }),
  );
  throw ApplicationFailure.nonRetryable(processed.failure.message, processed.failure.code);
}

async function processZip(
  input: DmsZipFileProcessingInput,
  runtime: DmsWorkflowRuntime,
  options: { readonly approvalEnabled: boolean },
): Promise<ZipActivityResult<FileProcessingOutput>> {
  const extraction = await extractZip(input, runtime);
  if (!extraction.ok) return extraction;
  const successfulExtraction = extraction.value.filter(({ success }) => success);
  const failedExtraction = extraction.value.filter(({ success }) => !success);
  const diff = await runtime.createDiff({
    projectId: input.projectId,
    zipFileId: input.fileId,
    files: successfulExtraction,
    projectVersion: input.sourceProjectVersion,
    entryFileType: input.entryFileType,
  });

  if (requiresApproval(input, diff, options.approvalEnabled)) {
    await runtime.persistZipDiff({
      zipFileId: input.fileId,
      sourceProjectVersion: input.sourceProjectVersion,
      diff,
    });
    await runtime.updateZipApprovalStatus({
      zipFileId: input.fileId,
      status: "REQUIRES_APPROVAL",
    });
    await runtime.updateZipStatus({ zipFileId: input.fileId, status: "COMPLETED" });
    return { ok: true, value: output([], [], "PENDING") };
  }

  let successful: FileProcessingSuccess[];
  let failed: FileProcessingFailure[];
  let projectVersion = input.sourceProjectVersion;
  if (input.fileType !== "ewms_zip" && present(diff)) {
    await runtime.persistZipDiff({
      zipFileId: input.fileId,
      sourceProjectVersion: input.sourceProjectVersion,
      diff,
    });
    projectVersion = await runtime.createProjectVersion({
      projectId: input.projectId,
      zipFileId: input.fileId,
      fileDiff: {
        deleted: diff.deleted.map(({ fileId, filename }) => ({ fileId, filename })),
        changed: diff.changed.map(({ fileId, filename }) => ({ fileId, filename })),
        renamed: diff.renamed.map(({ fileId, oldName, newName }) => ({
          fileId,
          filename: newName,
          oldName,
          newName,
        })),
      },
    });
    successful = successesFromCommittedDiff(diff);
    failed = failedExtraction.map(failure);
  } else {
    const activityResults: SingleFileResult[] = [];
    for (const item of [...diff.new, ...diff.changed]) {
      activityResults.push(
        await runtime.ingestFile({
          projectId: input.projectId,
          projectVersion: projectVersion,
          zipFileId: input.fileId,
          filename: item.filename,
          bucketPath: item.bucketPath,
          entryFileType: input.entryFileType,
          fileId: "fileId" in item ? item.fileId : null,
        }),
      );
    }
    for (const item of diff.renamed) {
      activityResults.push(
        await runtime.renameFile({
          projectId: input.projectId,
          projectVersion: projectVersion,
          fileId: item.fileId,
          oldName: item.oldName,
          newName: item.newName,
        }),
      );
    }
    activityResults.push(
      ...diff.duplicate.map(
        (item): SingleFileResult => ({
          success: false,
          filename: item.filename,
          action: "UPLOAD",
          fileId: null,
          bucketPath: item.bucketPath,
          errorCode: "DUPLICATE_FILE",
          errorMessage: `Duplicate file detected - matches existing file ${item.existingFileId}`,
        }),
      ),
    );
    const partitioned = partition([...activityResults, ...failedExtraction]);
    successful = partitioned.successful;
    failed = partitioned.failed;
  }

  if (input.fileType === "ewms_zip") {
    const fileIds = successful.flatMap((item) =>
      item.action === "INGEST" && item.fileId !== null ? [item.fileId] : [],
    );
    if (fileIds.length > 0) {
      await runtime.startEwms({
        projectId: input.projectId,
        fileIds: fileIds,
        projectVersion: projectVersion,
      });
    }
  }

  await runtime.updateZipStatus({ zipFileId: input.fileId, status: "COMPLETED" });
  return { ok: true, value: output(successful, failed, "APPROVED") };
}

export async function runSingleFileProcessingWorkflow(
  input: DmsSingleFileProcessingInput,
  runtime: DmsWorkflowRuntime,
): Promise<void> {
  try {
    await runtime.scanAndUpload({
      fileId: input.fileId,
      projectVersion: input.projectVersion,
      bucketPath: input.bucketPath,
      filename: input.filename,
      fileType: input.fileType,
    });
  } catch (error) {
    await bestEffort(() =>
      runtime.updateFileStatus({
        fileId: input.fileId,
        projectVersion: input.projectVersion,
        status: error instanceof Error && runtime.isCancellation(error) ? "CANCELED" : "FAILED",
      }),
    );
    throw error;
  }
}
