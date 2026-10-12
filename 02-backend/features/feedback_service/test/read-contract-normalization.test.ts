import { describe, expect, test } from "bun:test";

import {
  BatchNodesResponseSchema,
  parseReadContract,
  stabilizeBatchResponseForSnapshot,
} from "./support/read-contracts.ts";

const node = {
  nodeType: "feedback" as const,
  isDeleted: false,
  rating: "positive" as const,
  reason: "RESULT_CORRECT",
  text: "gut erkannt",
  userId: "8e8d1e5a-22a4-4eec-8adb-b33e952f3768",
  id: "f36a232c-56d2-4141-8366-e5ba8920b311",
  projectId: "9d810167-678a-419d-b7be-cb4b0f24b625",
  isOutdated: false,
  frontendParentIds: [],
  projectVersion: 1,
  updateType: "manual" as const,
  createdAt: "2026-05-20T07:14:10.276669Z",
  updatedAt: "2026-05-20T07:14:10.276669Z",
  sysPeriod: '["2026-07-16 09:39:20.953466+00",)',
};

describe("narrow incumbent snapshot stabilization", () => {
  test("validates an open-ended database period before replacing only its generated start", () => {
    const body = parseReadContract(BatchNodesResponseSchema, { results: [node] });

    expect(stabilizeBatchResponseForSnapshot(body, Date.parse("2026-07-16T09:40:00Z"))).toEqual({
      results: [
        {
          ...node,
          createdAt: "2026-05-20T07:14:10.276Z",
          updatedAt: "2026-05-20T07:14:10.276Z",
          sysPeriod: '["<database-period-start>",)',
        },
      ],
    });
  });

  test("rejects a database period start before the persisted update", () => {
    const body = parseReadContract(BatchNodesResponseSchema, {
      results: [{ ...node, sysPeriod: '["2026-01-01 00:00:00+00",)' }],
    });

    expect(() =>
      stabilizeBatchResponseForSnapshot(body, Date.parse("2026-07-16T09:40:00Z")),
    ).toThrow("precedes updated_at");
  });

  test("rejects a database period start beyond the observation window", () => {
    const body = parseReadContract(BatchNodesResponseSchema, {
      results: [{ ...node, sysPeriod: '["2026-07-16 10:00:00+00",)' }],
    });

    expect(() =>
      stabilizeBatchResponseForSnapshot(body, Date.parse("2026-07-16T09:40:00Z")),
    ).toThrow("after the observation window");
  });
});
