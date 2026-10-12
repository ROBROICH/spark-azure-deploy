import { describe, expect, test } from "bun:test";
import type { DocumentFilesService, FileResponse } from "@spark-workflow/core/documents/resource";

import { ObjectionsDocuments } from "../src/clients/documents.ts";

const projectId = "51000000-0000-4000-8000-000000000001";
const fileId = "51000000-0000-4000-8000-000000000002";
const content = new TextEncoder().encode("content");
const metadata = {
  id: fileId,
  type: "document",
  filename: "source.pdf",
  mimeType: "application/pdf",
  bucketPath: "projects/source.pdf",
  version: 1,
  projectId,
  projectVersion: 3,
  addedInVersion: 3,
  isDeleted: false,
  workflowId: null,
  runId: null,
  vectorSearchable: true,
  topics: [],
  createdAt: "2026-08-29T00:00:00Z",
  updatedAt: "2026-08-29T00:00:00Z",
} satisfies FileResponse;

const files = (overrides: Partial<DocumentFilesService> = {}): DocumentFilesService => ({
  getFile: async () => metadata,
  getZipFile: async () => {
    throw new Error("Unexpected ZIP lookup");
  },
  listProjectFiles: async () => [metadata],
  updateFileTopics: async () => metadata,
  uploadProjectFile: async () => metadata,
  uploadInternalFile: async () => fileId,
  downloadFile: async () => content,
  ...overrides,
});

describe("Objections local document adapter", () => {
  test("delegates the required file operations without HTTP or signed URLs", async () => {
    const calls: string[] = [];
    const adapter = new ObjectionsDocuments(
      files({
        async getFile(id, version) {
          calls.push(`get:${id}:${version}`);
          return metadata;
        },
        async listProjectFiles(id, version, type) {
          calls.push(`list:${id}:${version}:${type}`);
          return [metadata];
        },
        async uploadInternalFile(input) {
          calls.push(`upload:${input.projectId}:${input.fileType}:${input.filename}`);
          return fileId;
        },
        async downloadFile(id, version) {
          calls.push(`download:${id}:${version}`);
          return content;
        },
      }),
    );

    expect(await adapter.getFile(fileId, 3)).toEqual(metadata);
    expect(await adapter.listProjectFiles(projectId, 3, "document")).toEqual([metadata]);
    expect(
      await adapter.uploadInternalFile({
        projectId,
        fileType: "erwiderungs_export",
        filename: "export.csv",
        content,
      }),
    ).toBe(fileId);
    expect(await adapter.downloadFile(fileId, 3)).toEqual(content);
    expect(calls).toEqual([
      `get:${fileId}:3`,
      `list:${projectId}:3:document`,
      `upload:${projectId}:erwiderungs_export:export.csv`,
      `download:${fileId}:3`,
    ]);
  });

  test("maps file and storage failures to the existing dependency status", async () => {
    const adapter = new ObjectionsDocuments(
      files({
        async getFile() {
          throw new Error("file unavailable");
        },
        async downloadFile() {
          throw new Error("storage unavailable");
        },
      }),
    );

    const fileFailure = await adapter.getFile(fileId, 3).catch((error) => error);
    const downloadFailure = await adapter.downloadFile(fileId, 3).catch((error) => error);

    expect(fileFailure).toMatchObject({
      status: 502,
      code: "objections-management.DEPENDENCY_UNAVAILABLE",
    });
    expect(downloadFailure).toMatchObject({
      status: 502,
      code: "objections-management.DEPENDENCY_UNAVAILABLE",
    });
  });
});
