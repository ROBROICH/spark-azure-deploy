import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresRuntime, type PostgresRuntime } from "@spark-workflow/postgres-runtime";
import { eq } from "drizzle-orm";
import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { withAuditContext } from "@spark-workflow/audit-client";
import { recordAuditEntries, recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { auditLogs } from "@spark-workflow/audit-client/schema";

const databaseUrl = process.env.AUDIT_PERSISTENCE_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;

const projectTypes = pgTable("project_type", {
  id: uuid("id").notNull(),
  name: varchar("name").notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
});

const qualificationSchema = { auditLogs, projectTypes };

realPostgres("audit persistence against the Project Logic Alembic head", () => {
  let runtime: PostgresRuntime<typeof qualificationSchema>;

  const domainRows = (id: string) =>
    runtime.query(async (database) =>
      database
        .select({ id: projectTypes.id })
        .from(projectTypes)
        .where(eq(projectTypes.id, id)),
    );

  const auditRows = (id: string) =>
    runtime.query(async (database) =>
      database.select().from(auditLogs).where(eq(auditLogs.entityId, id)),
    );

  beforeAll(() => {
    runtime = createPostgresRuntime({
      url: databaseUrl!,
      schema: qualificationSchema,
      pool: {
        maxConnections: 2,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
  });

  afterAll(async () => {
    await runtime.close();
  });

  test("commits a domain row and meaningful audit row together", async () => {
    const entityId = crypto.randomUUID();
    const actorUserId = crypto.randomUUID();
    const triggeredByUserId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const requestStartTime = "2026-07-16T08:09:10.123Z";

    await runtime.transact(async () => {
      await runtime.query(async (database) => {
        const now = new Date(requestStartTime);
        await database.insert(projectTypes).values({
          id: entityId,
          name: `audit-commit-${entityId}`,
          createdAt: now,
          updatedAt: now,
        });
        await withAuditContext(
          {
            actorUserId,
            triggeredByUserId,
            workflowRunId: "workflow-run-4314",
            workflowType: "AuditPersistenceWorkflow",
            requestStartTime,
            requestId,
          },
          () =>
            recordAuditEntry(database, {
              projectId: entityId,
              entityId,
              entityType: "project_type",
              changeType: "action",
              actionType: "publish",
            }),
        );
      });
    });

    expect(await domainRows(entityId)).toEqual([{ id: entityId }]);
    const [row] = await auditRows(entityId);
    expect(row).toMatchObject({
      projectId: entityId,
      entityId,
      entityType: "project_type",
      changeType: "action",
      actionType: "publish",
      actorUserId,
      triggeredByUserId,
      workflowRunId: "workflow-run-4314",
      workflowType: "AuditPersistenceWorkflow",
      requestStartTime: new Date(requestStartTime),
      requestId,
    });
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.timestamp).toBeInstanceOf(Date);
  });

  test("rolls a domain row and audit row back together", async () => {
    const entityId = crypto.randomUUID();

    let failure: unknown;
    try {
      await runtime.transact(async () => {
        await runtime.query(async (database) => {
          const now = new Date();
          await database.insert(projectTypes).values({
            id: entityId,
            name: `audit-rollback-${entityId}`,
            createdAt: now,
            updatedAt: now,
          });
          await recordAuditEntry(database, {
            projectId: entityId,
            entityId,
            entityType: "project_type",
            changeType: "create",
          });
        });
        throw new Error("intentional rollback");
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toHaveProperty("message", "intentional rollback");

    expect(await domainRows(entityId)).toEqual([]);
    expect(await auditRows(entityId)).toEqual([]);
  });

  test("a failing bulk leaves no domain or partial audit state", async () => {
    const entityId = crypto.randomUUID();
    let failure: unknown;

    try {
      await runtime.transact(async () => {
        await runtime.query(async (database) => {
          const now = new Date();
          await database.insert(projectTypes).values({
            id: entityId,
            name: `audit-invalid-bulk-${entityId}`,
            createdAt: now,
            updatedAt: now,
          });
          await recordAuditEntries(database, {
            projectId: entityId,
            entries: [
              {
                entityId,
                entityType: "project_type",
                changeType: "create",
              },
              {
                entityId: "not-a-uuid",
                entityType: "project_type",
                changeType: "update",
              },
            ],
          });
        });
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected database error");
    expect(failure.message).toStartWith("Failed query:");
    expect(await domainRows(entityId)).toEqual([]);
    expect(await auditRows(entityId)).toEqual([]);
  });

  test("empty bulk is a database no-op inside the caller transaction", async () => {
    const projectId = crypto.randomUUID();

    await runtime.transact(async () => {
      await runtime.query(async (database) =>
        recordAuditEntries(database, { projectId, entries: [] }),
      );
    });

    expect(await auditRows(projectId)).toEqual([]);
  });
});
