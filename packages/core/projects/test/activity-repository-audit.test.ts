import { describe, expect, test } from "bun:test";
import { SQL } from "bun";

import { withAuditContext } from "@spark-workflow/audit-client";
import { drizzle } from "drizzle-orm/bun-sql";

import { projectLogicSchema } from "../src/db/schema.ts";
import type { ProjectLogicDatabase } from "../src/db.ts";
import { DrizzleProjectLogicActivityRepository } from "../src/temporal/activity-repository.ts";
import { testScope } from "./support/scopes.ts";

const PROJECT_ID = "72000000-0000-4000-8000-000000000001";
const ACTOR_ID = "72000000-0000-4000-8000-000000000002";

interface AuditRow {
  readonly projectId: string;
  readonly entityId: string;
  readonly entityType: string;
  readonly changeType: string;
  readonly actorUserId: string | null;
  readonly triggeredByUserId: string | null;
  readonly workflowRunId: string | null;
  readonly workflowType: string | null;
  readonly requestStartTime: Date | null;
  readonly requestId: string | null;
}

function deletionDatabase(deleteCounts: readonly number[]) {
  const remaining = [...deleteCounts];
  const auditRows: AuditRow[] = [];
  const transaction = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () =>
            Array.from({ length: remaining.shift() ?? 0 }, () => ({ id: PROJECT_ID })),
        }),
      }),
    }),
    insert: () => ({
      values: async (row: AuditRow) => {
        auditRows.push(row);
      },
    }),
  };
  const client = new SQL();
  const database = Object.assign(drizzle({ client, schema: projectLogicSchema }), {
    transaction: async <Result>(callback: (value: typeof transaction) => Promise<Result>) =>
      callback(transaction),
  });
  return { database, auditRows };
}

const ambientContext = {
  actorUserId: "81000000-0000-4000-8000-000000000001",
  triggeredByUserId: "81000000-0000-4000-8000-000000000002",
  workflowRunId: "ambient-run",
  workflowType: "AmbientWorkflow",
  requestStartTime: "2026-07-17T08:00:00Z",
  requestId: "81000000-0000-4000-8000-000000000003",
} as const;
const projectVersions = {
  ensureWritable: async (_projectId: string, version: number) => version,
  latestOne: async () => 1,
  validateLock: async () => undefined,
};

describe("Project Logic deletion audit isolation", () => {
  test("records a null-attributed delete once and retains only the activity run ID", async () => {
    const { database, auditRows } = deletionDatabase([1, 0]);
    const repository = new DrizzleProjectLogicActivityRepository(
      testScope<ProjectLogicDatabase>(database),
      projectVersions,
    );

    await withAuditContext(ambientContext, async () => {
      await repository.deleteProject(PROJECT_ID, 1, null, "activity-run-null");
      await repository.deleteProject(PROJECT_ID, 1, null, "activity-run-repeat");
    });

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      projectId: PROJECT_ID,
      entityId: PROJECT_ID,
      entityType: "project",
      changeType: "delete",
      actorUserId: null,
      triggeredByUserId: null,
      workflowRunId: "activity-run-null",
      workflowType: null,
      requestStartTime: null,
      requestId: null,
    });
  });

  test("keeps each partially-null actor field null instead of inheriting ambient context", async () => {
    const { database, auditRows } = deletionDatabase([2]);
    const repository = new DrizzleProjectLogicActivityRepository(
      testScope<ProjectLogicDatabase>(database),
      projectVersions,
    );

    await withAuditContext(ambientContext, () =>
      repository.deleteProject(
        PROJECT_ID,
        1,
        {
          actorUserId: ACTOR_ID,
          triggeredByUserId: null,
          workflowType: null,
        },
        "activity-run-partial",
      ),
    );

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      projectId: PROJECT_ID,
      entityId: PROJECT_ID,
      entityType: "project",
      changeType: "delete",
      actorUserId: ACTOR_ID,
      triggeredByUserId: null,
      workflowRunId: "activity-run-partial",
      workflowType: null,
      requestStartTime: null,
      requestId: null,
    });
  });
});
