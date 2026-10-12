import type { DocumentFileMetadata, DocumentFilesService } from "@spark-workflow/core/documents/resource";

import { objectionsErrors } from "../errors.ts";

type DocumentDependencyContext =
  | { readonly fileId: string; readonly projectVersion: number }
  | {
      readonly projectId: string;
      readonly projectVersion: number;
      readonly fileType: "document" | "ewms_document";
    }
  | { readonly projectId: string; readonly fileType: "erwiderungs_export" };

const dependencyFailure = (operation: string, cause: unknown, context: DocumentDependencyContext) =>
  objectionsErrors.DEPENDENCY_UNAVAILABLE({
    cause: cause instanceof Error ? cause : undefined,
    internal: { resource: "core/DocumentFiles", operation, ...context },
  });

export class ObjectionsDocuments {
  constructor(private readonly files: DocumentFilesService) {}

  async getFile(fileId: string, projectVersion: number): Promise<DocumentFileMetadata> {
    try {
      return await this.files.getFile(fileId, projectVersion);
    } catch (cause) {
      throw dependencyFailure("getFile", cause, { fileId, projectVersion });
    }
  }

  async listProjectFiles(
    projectId: string,
    projectVersion: number,
    fileType: "document" | "ewms_document",
  ): Promise<readonly DocumentFileMetadata[]> {
    try {
      return await this.files.listProjectFiles(projectId, projectVersion, fileType);
    } catch (cause) {
      throw dependencyFailure("listProjectFiles", cause, {
        projectId,
        projectVersion,
        fileType,
      });
    }
  }

  async uploadInternalFile(input: {
    readonly projectId: string;
    readonly fileType: "erwiderungs_export";
    readonly filename: string;
    readonly content: Uint8Array;
  }): Promise<string> {
    try {
      return await this.files.uploadInternalFile(input);
    } catch (cause) {
      throw dependencyFailure("uploadInternalFile", cause, {
        projectId: input.projectId,
        fileType: input.fileType,
      });
    }
  }

  async downloadFile(fileId: string, projectVersion: number): Promise<Uint8Array> {
    try {
      return await this.files.downloadFile(fileId, projectVersion);
    } catch (cause) {
      throw dependencyFailure("downloadFile", cause, { fileId, projectVersion });
    }
  }
}
