import { createHttpHost } from "@spark-workflow/http-host";
import type { TSchema } from "@sinclair/typebox";
import { describe, expect, test } from "bun:test";

import { WorkflowResponseSchema } from "../src/schemas.ts";
import { getWorkflow } from "../src/temporal/queries.ts";

// #314: workflows without a return value (e.g. the single-file virus scan) make Temporal's
// result() resolve to undefined. The required `result` field then fails response validation
// and polling clients receive 422 instead of the completed status.
const completedVoidWorkflow = {
  workflowId: "5a60ac70-a0b0-4956-9d40-d81942a1a1a1",
  runId: "run-1",
  type: "SingleFileProcessingWorkflow",
  startTime: new Date("2026-10-05T10:00:00.000Z"),
  closeTime: new Date("2026-10-05T10:00:01.000Z"),
  status: { name: "COMPLETED" },
};
const source = {
  get: async () => ({
    getHandle: () => ({
      describe: async () => completedVoidWorkflow,
      result: async () => undefined,
    }),
  }),
};

const app = createHttpHost("temporal-job-void-result-test").get(
  "/temporal/workflows/:workflowId",
  ({ params }) => getWorkflow(source as never, { workflowId: params.workflowId }),
  { response: WorkflowResponseSchema as TSchema },
);

describe("GET /temporal/workflows/{workflow_id} for a workflow without a return value", () => {
  test("returns the completed status with a null result", async () => {
    const response = await app.handle(
      new Request(`http://temporal-job.test/temporal/workflows/${completedVoidWorkflow.workflowId}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ status: "completed", result: null }));
  });
});
