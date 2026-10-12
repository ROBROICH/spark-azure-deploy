import type { FeatureHttp } from "@spark-workflow/http-host";

import type { coreFeature } from "../../src/manifest.ts";
import { runCheckpointCleanup, startCheckpointCleanup } from "./checkpoint-cleanup.ts";
import { createApprovalRoutes } from "./routes/approval.ts";
import { createFileMutationRoutes } from "./routes/file-mutations.ts";
import { createFileRoutes } from "./routes/files.ts";
import { createInternalFileRoutes } from "./routes/internal-files.ts";
import { createInternalZipMutationRoutes } from "./routes/internal-zip-mutations.ts";
import { createDocumentNodeRoutes } from "./routes/nodes.ts";
import { createZipFileRoutes } from "./routes/zip-files.ts";
import type { DocumentRuntime } from "./runtime.ts";
import { dmsModels } from "./schemas.ts";

export function createDocumentsRoutes(http: FeatureHttp<typeof coreFeature>) {
  return http
    .controller("core.documents.routes")
    .use(dmsModels)
    .guard({ documentRuntime: true }, (app) => {
      const files = createFileRoutes(app);
      const mutations = createFileMutationRoutes(files);
      const approvals = createApprovalRoutes(mutations);
      const internalFiles = createInternalFileRoutes(approvals);
      const internalZipMutations = createInternalZipMutationRoutes(internalFiles);
      const nodes = createDocumentNodeRoutes(internalZipMutations);
      return createZipFileRoutes(nodes);
    });
}

export {
  createDocumentFilesService,
  createDocumentsService,
  documentManagementVersioningProvider,
  documentFilesProvider,
  documentsProvider,
} from "./data.ts";
export {
  DocumentCommandConfiguration,
  DocumentConfiguration,
  DocumentFiles,
  DocumentManagementVersioning,
  Documents,
  DocumentTemporalCommands,
  type DocumentFileMetadata,
  type DocumentFilesService,
  type DocumentManagementVersioningService,
  type DocumentsService,
} from "./resource.ts";
export {
  parseDocumentCommandConfiguration,
  parseDocumentConfiguration,
  parseDocumentWorkerConfiguration,
} from "./env.ts";
export {
  DocumentRuntimeResource,
  documentRuntimeProvider,
  documentTemporalCommandsProvider,
  type DocumentRuntime,
} from "./runtime.ts";

export async function startDocumentWorker(
  runtime: DocumentRuntime,
  configuration: import("./env.ts").DocumentWorkerConfiguration,
  reportWorkflowStatus: (
    event: import("@spark-temporal/contracts").WorkflowStatusEvent,
  ) => Promise<void>,
) {
  const worker = await (await import("./worker.ts")).startDmsTemporalWorker(
    runtime,
    configuration,
    reportWorkflowStatus,
  );
  const cleanup = startCheckpointCleanup(() =>
    runtime.scope.query((database) =>
      runCheckpointCleanup(database, runtime.cleanStorage, {
        retentionDays: configuration.checkpointRetentionDays,
      }),
    ),
  );
  return {
    done: worker.done,
    async close(): Promise<void> {
      const results = await Promise.allSettled([cleanup.close(), worker.close()]);
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length > 0) throw new AggregateError(errors, "Failed to close DMS worker");
    },
  };
}

export { createDocumentV2Routes } from "./v2-routes.ts";
