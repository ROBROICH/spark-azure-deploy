import { describe, expect, test } from "bun:test";
import { projectContexts } from "@spark-temporal/typescript/context";

import { createFppDownloadsService } from "../src/fpp-downloads.ts";
import type { FppCommandInput } from "../src/schemas.ts";

const request = {
  projectId: "40000000-0000-4000-8000-000000000001",
  file: {
    url: "https://files.example.invalid/plan.zip",
    fileName: "plan.zip",
    fileId: "50000000-0000-4000-8000-000000000001",
    fileType: "PLANUNTERLAGEN",
  },
};

const stored = {
  id: request.file.fileId,
  projectId: request.projectId,
  projectVersion: 7,
  fileUrl: "https://stored.example.invalid/source.zip",
  fileName: "stored.zip",
  fileType: "PLANUNTERLAGEN",
  dmsFileId: null,
  downloaded: false,
};

describe("FPP Downloads Resource", () => {
  test("starts the download from the persisted source and its original project version", async () => {
    let command: FppCommandInput | undefined;
    const downloads = createFppDownloadsService({ getFile: async () => stored }, async (input) => {
      command = input;
      expect(projectContexts.getStore()).toEqual({
        projectId: request.projectId,
        projectVersion: 7,
      });
      return { workflowId: input.executionId };
    });

    const result = await downloads.start(request);

    const executionId = `FPPDownloadWorkflow-${request.projectId}-v7-${stored.id}`;
    expect(result.isOk() && result.value).toEqual({ parentJobId: executionId });
    expect(command).toEqual({
      workflowName: "FPPDownloadWorkflow",
      executionId,
      taskQueue: "orchestration",
      projectId: request.projectId,
      projectVersion: 7,
      idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
      idConflictPolicy: "USE_EXISTING",
      priority: null,
      file: {
        fileId: stored.id,
        url: stored.fileUrl,
        fileName: stored.fileName,
        fileType: stored.fileType,
      },
    });
  });

  test("rejects a source that is not stored for the project before dispatch", async () => {
    const missing = new Error("FPP file not found");
    let dispatched = false;
    const downloads = createFppDownloadsService(
      {
        getFile: async () => {
          throw missing;
        },
      },
      async (input) => {
        dispatched = true;
        return { workflowId: input.executionId };
      },
    );

    const result = await downloads.start(request);

    expect(result.isErr() && result.error).toBe(missing);
    expect(dispatched).toBe(false);
  });
});
