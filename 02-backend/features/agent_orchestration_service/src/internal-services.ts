import type { AdministrativeFileDraftVersioningService } from "@spark-workflow/administrative-file-draft";
import { projectErrors } from "@spark-workflow/core/projects/data";
import type {
  DocumentFilesService,
  FileResponse,
  ZipFileResponse,
} from "@spark-workflow/core/documents/resource";
import type {
  ProjectsService,
  ProjectLogicVersioningService,
} from "@spark-workflow/core/projects/resource";
import type { ExaminationService } from "@spark-workflow/examination-service";
import { examinationErrors } from "@spark-workflow/examination-service/resource";
import type { FormalCompletenessVersioningService } from "@spark-workflow/formal-completeness-check";
import type { FppFilesService } from "@spark-workflow/fpp-service/resource";
import type {
  NodeMutationInput,
  NodeMutationResult,
  NodeVersionService,
  NodeBatchReader,
  NodeTables,
} from "@spark-workflow/node-crud";
import type { PlausibilityNotesVersioningService } from "@spark-workflow/plausibility-notes";
import { projectContexts } from "@spark-temporal/typescript/context";
import { ApplicationFailure } from "@temporalio/common";
import { EvlogError } from "evlog";

import type { FileObject } from "./schemas.ts";
import { NODE_VERSION_CONFLICT_TYPE } from "./temporal/workflow-contracts.ts";

export interface AosInternalServices {
  readonly projects: ProjectsService;
  readonly documents: DocumentFilesService;
  readonly projectLogic: ProjectLogicVersioningService;
  readonly formalCompleteness: FormalCompletenessVersioningService;
  readonly plausibility: PlausibilityNotesVersioningService;
  readonly examination: ExaminationService;
  readonly administrativeFileDraft: AdministrativeFileDraftVersioningService;
  readonly fppFiles: FppFilesService;
}

class AosProjectContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AosProjectContextError";
  }
}

export function projectVersion(projectId?: string): number {
  const context = projectContexts.getStore();
  if (context === undefined) {
    throw new AosProjectContextError("AOS internal operations require project context");
  }
  if (projectId !== undefined && context.projectId !== projectId) {
    throw new AosProjectContextError(
      `AOS project ${projectId} does not match context project ${context.projectId}`,
    );
  }
  return context.projectVersion;
}

function graph<Tables extends NodeTables>(
  service: NodeVersionService & { batchNodes: NodeBatchReader<Tables> },
) {
  return {
    async listNodes(projectId: string) {
      return {
        nodes: (await service.listNodes(projectId, projectVersion(projectId))).map((node) => ({
          ...node,
          parents: node.parents.map((parent) => ({ ...parent })),
          frontendParentIds: [...node.frontendParentIds],
        })),
      };
    },
    async batchGetNodes<Key extends keyof Tables>(
      projectId: string,
      nodes: readonly { nodeType: string; id: string }[],
      table: Key,
    ) {
      return {
        results: await service.batchNodes(
          projectId,
          projectVersion(projectId),
          table,
          nodes.map(({ id }) => id),
        ),
      };
    },
  };
}

function mutableGraph<Tables extends NodeTables, Input extends NodeMutationInput>(
  service: NodeVersionService & {
    batchNodes: NodeBatchReader<Tables>;
    updateNodes(
      projectId: string,
      projectVersion: number,
      input: Input,
    ): Promise<NodeMutationResult>;
  },
) {
  return {
    ...graph(service),
    async updateNodes(projectId: string, input: Input) {
      try {
        return await service.updateNodes(projectId, projectVersion(projectId), input);
      } catch (error) {
        if (EvlogError.isEvlogError(error) && error.code === projectErrors.CONFLICT.code) {
          throw ApplicationFailure.retryable(error.message, NODE_VERSION_CONFLICT_TYPE);
        }
        throw error;
      }
    },
  };
}

async function processingWrite<Output>(
  projects: Pick<ProjectsService, "resolveLatestVersion">,
  projectId: string,
  write: (projectVersion: number) => Promise<Output>,
): Promise<Output> {
  const sourceVersion = projectVersion(projectId);
  try {
    return await write(sourceVersion);
  } catch (error) {
    if (!EvlogError.isEvlogError(error)) throw error;
    if (error.code === examinationErrors.PROCESSING_SOURCE_CHANGED.code) {
      throw ApplicationFailure.nonRetryable(error.message, error.code);
    }
    if (error.code === projectErrors.CONFLICT.code) {
      const latest = await projects.resolveLatestVersion(projectId);
      if (latest.isOk() && latest.value > sourceVersion) {
        throw ApplicationFailure.nonRetryable(error.message, NODE_VERSION_CONFLICT_TYPE);
      }
    }
    throw error;
  }
}

function fileObject(value: FileResponse | ZipFileResponse): FileObject {
  return "mimeType" in value
    ? value
    : {
        ...value,
        mimeType: null,
        workflowId: null,
        runId: null,
        vectorSearchable: null,
        topics: [],
      };
}

export function createAosInternalActivityDependencies(services: AosInternalServices) {
  const examination = mutableGraph(services.examination);
  return {
    projectLogic: {
      ...graph(services.projectLogic),
      async listTopics(projectId: string) {
        const topics = await services.projects.listTopics(projectId, projectVersion(projectId));
        if (topics.isErr()) throw topics.error;
        return [...topics.value];
      },
    },
    dms: {
      async getZipFile(fileId: string, projectId: string) {
        const receipt = await services.documents.getZipFile(fileId, projectVersion(projectId));
        if (receipt.projectId !== projectId || receipt.type !== "zip") {
          throw ApplicationFailure.nonRetryable(
            `ZIP ${fileId} does not belong to project ${projectId}`,
            "FPP_SOURCE_CONFLICT",
          );
        }
        return {
          ...fileObject(receipt),
          workflowStatus: receipt.workflowStatus,
          approvalStatus: receipt.approvalStatus,
        };
      },
      async getFileById(fileId: string) {
        return fileObject(await services.documents.getFile(fileId, projectVersion()));
      },
      async listFiles(projectId: string, fileType = "document") {
        if (fileType !== "document" && fileType !== "ewms_document") return [];
        return (
          await services.documents.listProjectFiles(projectId, projectVersion(projectId), fileType)
        ).map(fileObject);
      },
      async updateFileTopics(fileId: string, topics: readonly string[]) {
        return fileObject(
          await services.documents.updateFileTopics(fileId, projectVersion(), topics),
        );
      },
      async uploadFile(input: {
        projectId: string;
        filename: string;
        type: "document" | "zip";
        bytes: Uint8Array;
      }) {
        const result = await services.documents.uploadProjectFile({
          projectId: input.projectId,
          projectVersion: projectVersion(input.projectId),
          fileType: input.type,
          filename: input.filename,
          content: input.bytes,
        });
        return result === null ? null : fileObject(result);
      },
    },
    formal: {
      sendResults: (projectId: string, fileId: string) =>
        services.formalCompleteness.sendResults(projectId, projectVersion(projectId), fileId),
      getResults: (projectId: string) =>
        services.formalCompleteness.getResults(projectId, projectVersion(projectId)),
      async getTemplateDocumentTypes(projectId: string) {
        return await services.formalCompleteness.getTemplateDocumentTypes(
          projectId,
          projectVersion(projectId),
        );
      },
      sendTocResults: (projectId: string, fileId: string) =>
        services.formalCompleteness.sendTocResults(projectId, projectVersion(projectId), fileId),
    },
    plausibility: {
      sendResults: (projectId: string, fileId: string) =>
        services.plausibility.sendResults(projectId, fileId, projectVersion(projectId)),
    },
    fppFiles: {
      async getFile(projectId: string, fileId: string) {
        const version = projectVersion(projectId);
        const source = await services.fppFiles.getFile(projectId, fileId);
        if (source.projectVersion !== version) {
          throw ApplicationFailure.nonRetryable(
            `FPP file ${fileId} belongs to project version ${source.projectVersion}, not ${version}`,
            "FPP_SOURCE_CONFLICT",
          );
        }
        return source;
      },
      confirmDownload: (projectId: string, fileId: string, dmsFileId: string) =>
        services.fppFiles.confirmDownload({
          projectId,
          projectVersion: projectVersion(projectId),
          fileId,
          dmsFileId,
        }),
    },
    examination: {
      ...examination,
      replaceAssessment: (
        projectId: string,
        input: Parameters<ExaminationService["replaceAssessment"]>[2],
      ) =>
        processingWrite(services.projects, projectId, (version) =>
          services.examination.replaceAssessment(projectId, version, input),
        ),
      replaceFundstellen: (
        projectId: string,
        input: Parameters<ExaminationService["replaceFundstellen"]>[2],
      ) =>
        processingWrite(services.projects, projectId, (version) =>
          services.examination.replaceFundstellen(projectId, version, input),
        ),
      async getNormDeconstructions(jurabk: string, paragraph: string) {
        return services.examination.getNormDeconstructions(jurabk, paragraph);
      },
      async saveNormDeconstruction(
        input: Parameters<ExaminationService["saveNormDeconstructions"]>[0][number],
      ) {
        await services.examination.saveNormDeconstructions([input]);
      },
    },
    administrativeFileDraft: {
      ...mutableGraph(services.administrativeFileDraft),
      getRisks: (projectId: string) =>
        services.administrativeFileDraft
          .getRisks(projectId, projectVersion(projectId))
          .then((risks) => risks.map((risk) => ({ ...risk }))),
    },
  };
}
