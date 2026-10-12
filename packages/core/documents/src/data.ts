import { provide } from "@spark-workflow/resource";
import { EvlogError } from "evlog";

import { DocumentRuntimeResource, type DocumentRuntime } from "./runtime.ts";
import type { FileResponse } from "./schemas.ts";
import {
  DocumentFiles,
  DocumentManagementVersioning,
  Documents,
  type DocumentFilesService,
  type DocumentManagementVersioningService,
  type DocumentsService,
} from "./resource.ts";

const createDocumentManagementVersioningService = (
  runtime: DocumentRuntime,
): DocumentManagementVersioningService => {
  const service: DocumentManagementVersioningService = {
    ...runtime.versioning,
    getZipDiff: (projectId, zipFileId, sourceVersion) =>
      runtime.mutations.getInternalDiff(projectId, zipFileId, sourceVersion),
    updateZipApprovalStatus: (projectId, zipFileId, approvalStatus, error) =>
      runtime.mutations.updateZipApprovalStatus(projectId, zipFileId, approvalStatus, error),
    commitZipDiff: (input) => runtime.mutations.commitDiff(input.projectId, input.zipFileId, input),
  };
  return Object.freeze(service);
};

export const createDocumentsService = (runtime: DocumentRuntime): DocumentsService => {
  const service: DocumentsService = {
    readResultFile: (fileId, projectVersion) =>
      runtime.files.readResultFile(fileId, projectVersion),
  };
  return Object.freeze(service);
};

export const createDocumentFilesService = (runtime: DocumentRuntime): DocumentFilesService => {
  const service: DocumentFilesService = {
    getFile: (fileId, projectVersion) => runtime.files.getFile(fileId, projectVersion),
    getZipFile: (fileId, projectVersion) => runtime.files.getZip(fileId, projectVersion),
    async listProjectFiles(projectId, projectVersion, fileType) {
      const files: FileResponse[] = [];
      for (let page = 1; ; page += 1) {
        const batch = await runtime.files.listFiles({
          type: fileType,
          projectId,
          projectVersion,
          page,
          pageSize: 500,
        });
        files.push(...batch);
        if (batch.length < 500) return files;
      }
    },
    updateFileTopics: (fileId, projectVersion, topics) =>
      runtime.mutations.updateFile(fileId, projectVersion, { topics: [...topics] }),
    async uploadProjectFile(input) {
      try {
        return await runtime.files.writeProjectFile(input);
      } catch (error) {
        if (EvlogError.isEvlogError(error) && error.status === 415) return null;
        throw error;
      }
    },
    uploadInternalFile: async (input) =>
      (
        await runtime.files.writeInternalFile({
          projectId: input.projectId,
          type: input.fileType,
          filename: input.filename,
          content: input.content,
        })
      ).id,
    downloadFile: (fileId, projectVersion) => runtime.files.readFile(fileId, projectVersion),
  };
  return Object.freeze(service);
};

export const documentsProvider = provide({
  resource: Documents,
  needs: { runtime: DocumentRuntimeResource },
  make: ({ runtime }) => createDocumentsService(runtime),
});

export const documentFilesProvider = provide({
  resource: DocumentFiles,
  needs: { runtime: DocumentRuntimeResource },
  make: ({ runtime }) => createDocumentFilesService(runtime),
});

export const documentManagementVersioningProvider = provide({
  resource: DocumentManagementVersioning,
  needs: { runtime: DocumentRuntimeResource },
  make: ({ runtime }) => createDocumentManagementVersioningService(runtime),
});

export { dmsErrors } from "./errors.ts";
export { loadResultFile } from "./result-file.ts";
