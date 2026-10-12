import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";

import { withAuditContext } from "@spark-workflow/audit-client";
import {
  recordAuditEntries,
  recordAuditEntry,
  type AuditEntry,
} from "@spark-workflow/audit-client/persistence";
import { auditLogs } from "@spark-workflow/audit-client/schema";

type AuditTransaction = Parameters<typeof recordAuditEntry>[0];
type AuditRow = typeof auditLogs.$inferInsert;

interface InsertCapture {
  readonly tables: (typeof auditLogs)[];
  readonly values: (AuditRow | AuditRow[])[];
}

const capturingTransaction = (capture: InsertCapture, failure?: Error): AuditTransaction => ({
  insert: (table) => {
    capture.tables.push(table);
    return {
      values: async (values) => {
        capture.values.push(values);
        if (failure) throw failure;
      },
    };
  },
});

describe("caller-transaction audit persistence", () => {
  test("single insert joins only the supplied transaction and resolves attribution", async () => {
    const capture: InsertCapture = { tables: [], values: [] };
    const transaction = capturingTransaction(capture);
    const projectId = crypto.randomUUID();
    const entityId = crypto.randomUUID();
    const actorUserId = crypto.randomUUID();
    const triggeredByUserId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    await withAuditContext(
      {
        actorUserId,
        triggeredByUserId,
        workflowRunId: "workflow-run-4314",
        workflowType: "ActiveWorkflow",
        requestStartTime: "2026-07-16T08:09:10.123Z",
        requestId,
      },
      () =>
        recordAuditEntry(transaction, {
          projectId,
          entityId,
          entityType: "project",
          changeType: "action",
          actionType: "publish",
        }),
    );

    expect(capture.tables).toEqual([auditLogs]);
    expect(capture.values).toHaveLength(1);
    const row = capture.values[0];
    if (row === undefined || Array.isArray(row)) throw new Error("single audit insert was not one row");
    expect(row).toMatchObject({
      projectId,
      entityId,
      entityType: "project",
      changeType: "action",
      actionType: "publish",
      actorUserId,
      triggeredByUserId,
      workflowRunId: "workflow-run-4314",
      workflowType: "ActiveWorkflow",
      requestStartTime: new Date("2026-07-16T08:09:10.123Z"),
      requestId,
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("non-empty bulk uses one transaction insert and distinct row ids", async () => {
    const capture: InsertCapture = { tables: [], values: [] };
    const transaction = capturingTransaction(capture);
    const projectId = crypto.randomUUID();

    await recordAuditEntries(transaction, {
      projectId,
      entries: [
        {
          entityId: crypto.randomUUID(),
          entityType: "project",
          changeType: "create",
        },
        {
          entityId: crypto.randomUUID(),
          entityType: "project",
          changeType: "delete",
        },
      ],
    });

    const rows = capture.values[0];
    if (!Array.isArray(rows)) throw new Error("bulk audit insert was not a row array");
    expect(capture.tables).toEqual([auditLogs]);
    expect(capture.values).toHaveLength(1);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.projectId === projectId)).toBeTrue();
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });

  test("splits oversized bulks into bounded statements without dropping rows", async () => {
    const capture: InsertCapture = { tables: [], values: [] };
    const transaction = capturingTransaction(capture);
    const projectId = crypto.randomUUID();
    const entries: AuditEntry[] = Array.from(
      { length: 30_000 },
      () => ({
        entityId: crypto.randomUUID(),
        entityType: "entity",
        changeType: "update",
      }),
    );

    await recordAuditEntries(transaction, { projectId, entries });

    const rows = capture.values.flatMap((chunk) => (Array.isArray(chunk) ? chunk : [chunk]));
    expect(rows).toHaveLength(entries.length);
    const columnCount = Object.keys(getTableColumns(auditLogs)).length;
    for (const chunk of capture.values) {
      if (!Array.isArray(chunk)) throw new Error("bulk audit insert was not a row array");
      expect(chunk.length * columnCount).toBeLessThanOrEqual(65_535);
    }
  });

  test("empty bulk is a database no-op", async () => {
    const transaction: AuditTransaction = {
      insert: () => {
        throw new Error("empty bulk touched the transaction");
      },
    };

    await recordAuditEntries(transaction, {
      projectId: crypto.randomUUID(),
      entries: [],
    });
  });

  test("database failures propagate unchanged", async () => {
    const expected = new Error("database rejected the audit batch");
    const capture: InsertCapture = { tables: [], values: [] };
    const transaction = capturingTransaction(capture, expected);

    let failure: unknown;
    try {
      await recordAuditEntries(transaction, {
        projectId: crypto.randomUUID(),
        entries: [
          {
            entityId: crypto.randomUUID(),
            entityType: "project",
            changeType: "update",
          },
        ],
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(expected);
  });
});
