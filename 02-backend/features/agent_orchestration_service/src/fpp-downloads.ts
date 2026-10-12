import {
  AGENT_ORCHESTRATION_FPP_DOWNLOAD_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
} from "@spark-temporal/contracts";
import { runWithProjectContext } from "@spark-temporal/typescript/context";
import { Result } from "better-result";

import type {
  FppDownloadRequest,
  FppDownloadsService,
  FppFilesService,
} from "@spark-workflow/fpp-service/resource";
import type { FppCommandInput } from "./schemas.ts";
import { workflowId } from "./temporal/workflow-id.ts";

type StartFppDownload = (input: FppCommandInput) => Promise<{ workflowId: string }>;

const normalizeError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error("FPP download workflow failed", { cause });

export function createFppDownloadsService(
  files: Pick<FppFilesService, "getFile">,
  startWorkflow: StartFppDownload,
): FppDownloadsService {
  return Object.freeze({
    start(input: FppDownloadRequest) {
      return Result.gen(async function* () {
        const source = yield* Result.await(
          Result.tryPromise({
            try: () => files.getFile(input.projectId, input.file.fileId),
            catch: normalizeError,
          }),
        );
        const { projectVersion } = source;
        const result = yield* Result.await(
          Result.tryPromise({
            try: () =>
              runWithProjectContext({ projectId: input.projectId, projectVersion }, () =>
                startWorkflow({
                  workflowName: AGENT_ORCHESTRATION_FPP_DOWNLOAD_WORKFLOW,
                  executionId: workflowId(
                    AGENT_ORCHESTRATION_FPP_DOWNLOAD_WORKFLOW,
                    input.projectId,
                    projectVersion,
                    source.id,
                  ),
                  taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
                  projectId: input.projectId,
                  projectVersion,
                  idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
                  idConflictPolicy: "USE_EXISTING",
                  priority: null,
                  file: {
                    fileId: source.id,
                    url: source.fileUrl,
                    fileName: source.fileName ?? "planunterlagen.zip",
                    fileType: source.fileType,
                  },
                }),
              ),
            catch: normalizeError,
          }),
        );
        return Result.ok({ parentJobId: result.workflowId });
      });
    },
  });
}
