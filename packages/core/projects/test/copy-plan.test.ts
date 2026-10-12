import { describe, expect, test } from "bun:test";

import type { NodeSummaryPayload } from "../src/temporal/contracts.ts";
import { buildProjectVersionCopyPlan } from "../src/temporal/copy-plan.ts";

const PROJECT_ID = "72000000-0000-4000-8000-000000000001";
const FILE_ID = "72000000-0000-4000-8000-000000000002";
const DOCUMENT_ID = "72000000-0000-4000-8000-000000000003";
const TOPIC_ID = "72000000-0000-4000-8000-000000000004";
const TOPIC_NORM_ID = "72000000-0000-4000-8000-000000000005";

describe("Project Logic cross-service copy plan", () => {
  test("cascades graph changes and emits review-friendly named overrides", async () => {
    const services = [
      "projectLogicService",
      "documentManagementService",
      "examinationService",
    ] as const;
    const rows = {
      projectLogicService: [
        { id: TOPIC_ID, nodeType: "topic", parents: [], frontendParentIds: [] },
        {
          id: TOPIC_NORM_ID,
          nodeType: "topic_norm",
          parents: [{ nodeType: "topic", id: TOPIC_ID }],
          frontendParentIds: [],
        },
      ],
      documentManagementService: [
        { id: FILE_ID, nodeType: "file", parents: [], frontendParentIds: [] },
      ],
      examinationService: [
        {
          id: DOCUMENT_ID,
          nodeType: "dokument",
          parents: [{ nodeType: "file", id: FILE_ID }],
          frontendParentIds: [`topic:${TOPIC_ID}`],
        },
      ],
    } satisfies Record<(typeof services)[number], NodeSummaryPayload[]>;
    let batchRefs: unknown;
    const result = await buildProjectVersionCopyPlan({
      services,
      projectId: PROJECT_ID,
      sourceVersion: 1,
      fileDiff: {
        deleted: [],
        changed: [{ fileId: FILE_ID, filename: "renamed.pdf" }],
        renamed: [{ fileId: FILE_ID, newName: "renamed.pdf" }],
      },
      async listNodes(service) {
        return rows[service as keyof typeof rows].map((row) => ({ ...row, _service: service }));
      },
      async batchNodes(_service, _project, _version, refs) {
        batchRefs = refs;
        return [{ id: TOPIC_NORM_ID, mvpStatus: "checked", satzStatuses: {} }];
      },
    });

    expect(batchRefs).toEqual([{ nodeType: "topic_norm", id: TOPIC_NORM_ID }]);
    expect(result).toEqual({
      survivorsPerService: {
        projectLogicService: [
          { nodeType: "topic", id: TOPIC_ID },
          {
            nodeType: "topic_norm",
            id: TOPIC_NORM_ID,
            overrides: { mvpStatus: "needs_revision" },
          },
        ],
        examinationService: [
          {
            nodeType: "dokument",
            id: DOCUMENT_ID,
            setOutdated: true,
            overrides: { filename: "renamed.pdf" },
          },
        ],
      },
      deletedFileIds: [],
      deletedKeysCount: 0,
    });
  });
});
