import { describe, expect, test } from "bun:test";

import { nodePayload } from "@spark-workflow/node-crud";
import { getTableColumns } from "drizzle-orm";

import { fileTopics, files, zipFiles } from "../src/db/schema.ts";
import { createDocumentManagementDescriptor } from "../src/node/descriptor.ts";

const projectId = "10000000-0000-4000-8000-000000000001";
const fileId = "20000000-0000-4000-8000-000000000001";
const zipId = "40000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-01-04T12:00:00.000Z");
const documentManagementNodes = createDocumentManagementDescriptor().nodes;

const node = (nodeType: string) => {
  const definition = documentManagementNodes.find((candidate) => candidate.nodeType === nodeType);
  if (!definition) throw new Error(`Missing node definition '${nodeType}'`);
  return definition;
};

const commonRow = {
  projectId,
  projectVersion: 3,
  createdAt,
  updatedAt: createdAt,
  sysPeriod: '["2026-01-04 12:00:00+00",)',
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: [],
  updateType: "AUTOMATED",
};

describe("Document Management canonical node descriptor", () => {
  test("binds the existing camel-key Drizzle tables by their physical public columns", () => {
    expect(documentManagementNodes.map(({ nodeType, table }) => [nodeType, table])).toEqual([
      ["file", files],
      ["file_topic", fileTopics],
      ["zip_file", zipFiles],
    ]);
    expect(getTableColumns(files).mimeType.name).toBe("mime_type");
    expect(getTableColumns(fileTopics).fileId.name).toBe("file_id");
    expect(getTableColumns(zipFiles).approvalStatus.name).toBe("approval_status");
  });

  test("projects camel-key file rows onto the camel-case wire contract", () => {
    expect(
      nodePayload(node("file"), {
        id: fileId,
        ...commonRow,
        type: "DOCUMENT",
        filename: "basis.pdf",
        mimeType: "application/pdf",
        version: 1,
        bucketPath: "documents/basis.pdf",
        addedInVersion: 2,
        workflowId: null,
        runId: null,
        vectorSearchable: false,
        sourceZipFileId: zipId,
        workflowStatus: null,
      }),
    ).toMatchObject({
      nodeType: "file",
      id: fileId,
      projectId: projectId,
      type: "document",
      mimeType: "application/pdf",
      bucketPath: "documents/basis.pdf",
      sourceZipFileId: zipId,
      updateType: "automated",
    });
  });

  test("preserves the persisted and external parent graph used for copy ordering", () => {
    expect(node("file").parents).toEqual(
      expect.arrayContaining([
        { kind: "persisted", field: "sourceZipFileId", nodeType: "zip_file" },
      ]),
    );
    expect(node("file_topic").parents).toEqual(
      expect.arrayContaining([
        { kind: "persisted", field: "fileId", nodeType: "file" },
        {
          kind: "external",
          field: "topicId",
          nodeType: "topic",
          service: "projectLogicService",
        },
        {
          kind: "external",
          field: "subtopicId",
          nodeType: "subtopic",
          service: "projectLogicService",
        },
      ]),
    );
  });
});
