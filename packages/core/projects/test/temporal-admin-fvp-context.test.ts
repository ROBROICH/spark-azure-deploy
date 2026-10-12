import { describe, expect, mock, test } from "bun:test";

import {
  captureWorkflowContext,
  runWithProjectContext,
} from "@spark-temporal/typescript/context";

const projectId = "ad5ac8c1-d638-4805-b98e-792a77de6dce";
const startedContexts: ReturnType<typeof captureWorkflowContext>[] = [];

await mock.module("@temporalio/client", () => ({
  Connection: {
    async connect() {
      return { async close() {} };
    },
  },
  Client: class {
    readonly workflow = {
      async start(_workflowType: string, options: { readonly workflowId: string }) {
        startedContexts.push(captureWorkflowContext());
        return { workflowId: options.workflowId };
      },
    };
  },
}));

const { createProjectLogicTemporalAdmin } = await import("../src/temporal/temporal-admin.ts");

describe("createProjectLogicTemporalAdmin.startFvp", () => {
  test("starts the FVP in the target version context, not the caller's version", async () => {
    const admin = await createProjectLogicTemporalAdmin({
      targetHost: "fixture.invalid:7233",
      namespace: "fixture",
    });

    const workflowId = await runWithProjectContext({ projectId, projectVersion: 2 }, () =>
      admin.startFvp(projectId, 3),
    );

    expect(workflowId).toBe(`FVPWorkflow-${projectId}-v3`);
    expect(startedContexts.map((context) => context.project)).toEqual([
      { projectId, projectVersion: 3 },
    ]);
  });
});
