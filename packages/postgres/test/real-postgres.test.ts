import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { eq, inArray } from "drizzle-orm";
import { integer, pgSchema } from "drizzle-orm/pg-core";
import { createError, EvlogError } from "evlog";

import {
  createPostgresRuntime,
  NestedPostgresTransactionError,
  PostgresReadinessUnavailableError,
  postgresErrors,
  type PostgresRuntime,
} from "../src";
import {
  auditLogs,
  projectHistory,
  projectTypeHistory,
  projectTypes,
  projects,
  projectVersionLocks,
  qualificationSchema,
  topicHistory,
  topicNormHistory,
  topicNorms,
  topics,
} from "./support/schema";
import { cleanupQualificationRows } from "./support/cleanup";

const databaseUrl = process.env.POSTGRES_RUNTIME_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;
const pgCatalog = pgSchema("pg_catalog");
const readinessCatalog = pgCatalog.table("pg_type", {
  oid: integer("oid").notNull(),
});

async function rejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error("Expected PostgreSQL operation to reject");
}

realPostgres("private Drizzle runtime against the aggregate schema", () => {
  let runtime: PostgresRuntime<typeof qualificationSchema>;
  const createdIds = new Set<string>();

  const timestamps = () => {
    const value = new Date();
    return { createdAt: value, updatedAt: value };
  };

  beforeAll(() => {
    runtime = createPostgresRuntime({
      url: databaseUrl!,
      schema: qualificationSchema,
      pool: {
        maxConnections: 3,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
  });

  afterAll(async () => {
    try {
      await cleanupQualificationRows(runtime, createdIds);
    } finally {
      await runtime.close();
    }
  });

  test("repeated readiness uses Drizzle and supports relational reads", async () => {
    await runtime.ready();
    await runtime.ready();
    await runtime.query(async (database) => {
      const absentId = crypto.randomUUID();
      const relationalRead = database.query.projectTypes.findMany({
        where: (table, { eq }) => eq(table.id, absentId),
      });
      expect(await relationalRead).toEqual([]);
    });
  });

  test("queued transactions preserve each caller's async context", async () => {
    const limited = createPostgresRuntime({
      url: databaseUrl!,
      schema: qualificationSchema,
      pool: { maxConnections: 1 },
    });
    const context = new AsyncLocalStorage<string>();
    const firstContext = crypto.randomUUID();
    const secondContext = crypto.randomUUID();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    try {
      await limited.ready();
      const first = context.run(firstContext, () =>
        limited.transact(async () => {
          entered.resolve();
          await release.promise;
          return context.getStore();
        }),
      );
      await entered.promise;
      const second = context.run(secondContext, () =>
        limited.transact(async () => context.getStore()),
      );
      release.resolve();
      expect(await Promise.all([first, second])).toEqual([firstContext, secondContext]);
    } finally {
      release.resolve();
      await limited.close();
    }
  });

  test("round-trips UUID, arrays, JSONB, enum, timestamps, nulls, and server defaults", async () => {
    const projectId = crypto.randomUUID();
    const topicId = crypto.randomUUID();
    const topicNormId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    const now = new Date("2026-07-16T12:34:56.789Z");
    createdIds.add(projectId);
    createdIds.add(topicId);
    createdIds.add(topicNormId);

    try {
      await runtime.query(async (database) => {
        const [project] = await database
          .insert(projects)
          .values({
            id: projectId,
            projectId: null,
            createdAt: now,
            updatedAt: now,
            originalCreatedAt: now,
            createdById: actorId,
            name: null,
            state: "BE",
          })
          .returning();

        expect(project).toMatchObject({
          id: projectId,
          projectId: null,
          projectVersion: 1,
          name: null,
          state: "BE",
          isDeleted: false,
          isOutdated: false,
          imported: false,
          frontendParentIds: [],
          updateType: "AUTOMATED",
        });
        expect(project?.createdAt.toISOString()).toBe(now.toISOString());
        expect(project?.sysPeriod).toContain("[");

        const [topic] = await database
          .insert(topics)
          .values({
            id: topicId,
            projectId,
            projectVersion: 1,
            createdAt: now,
            updatedAt: now,
            name: "Qualification topic",
            description: null,
            parentTopicId: null,
            isDeleted: false,
            isOutdated: false,
            frontendParentIds: ["root", "topic"],
            mvpAssignees: [actorId],
            showInMvp: true,
            showInEwm: false,
            showInBeschluss: false,
            rpbAssignees: [],
            updateType: "MANUAL",
          })
          .returning();

        expect(topic).toMatchObject({
          frontendParentIds: ["root", "topic"],
          mvpAssignees: [actorId],
          rpbAssignees: [],
          updateType: "MANUAL",
          description: null,
        });

        const [topicNorm] = await database
          .insert(topicNorms)
          .values({
            id: topicNormId,
            projectId,
            projectVersion: 1,
            topicId,
            createdAt: now,
            updatedAt: now,
            jurabk: "BGB",
            paragraphNr: "1",
            type: "PRUEFUNG",
            mvpStatus: "needs_revision",
            satzStatuses: { "1": "checked", "2": "needs_revision" },
            isDeleted: false,
            isOutdated: false,
            frontendParentIds: [],
            updateType: "AUTOMATED",
          })
          .returning();

        expect(topicNorm).toMatchObject({
          type: "PRUEFUNG",
          mvpStatus: "needs_revision",
          satzStatuses: { "1": "checked", "2": "needs_revision" },
          frontendParentIds: [],
        });
      });
    } finally {
      await cleanupQualificationRows(runtime, [projectId, topicId, topicNormId]);
    }
  });

  test("database constraints are authoritative", async () => {
    const projectId = crypto.randomUUID();
    const lockToken = `qualification-${crypto.randomUUID()}`;
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    createdIds.add(firstId);
    createdIds.add(secondId);

    try {
      await runtime.query(async (database) => {
        const [lock] = await database
          .insert(projectVersionLocks)
          .values({
            id: firstId,
            projectId,
            sourceVersion: 1,
            targetVersion: 2,
            lockToken,
            ...timestamps(),
          })
          .returning();
        expect(lock).toMatchObject({
          status: "ACTIVE",
          error: null,
          zipFileId: null,
        });

        const duplicateLockToken = database.insert(projectVersionLocks).values({
          id: secondId,
          projectId: crypto.randomUUID(),
          sourceVersion: 2,
          targetVersion: 3,
          lockToken,
          ...timestamps(),
        });
        expect(await rejection(duplicateLockToken)).toBeDefined();
      });
    } finally {
      await cleanupQualificationRows(runtime, [firstId, secondId]);
    }
  });

  test("reports database failures from the runtime in the postgres catalog", async () => {
    const id = crypto.randomUUID();
    createdIds.add(id);
    const insert = () =>
      runtime.query((database) =>
        database.insert(projectTypes).values({ id, name: `conflict-${id}`, ...timestamps() }),
      );
    const domainError = createError({ status: 404, message: "Missing" });

    try {
      await insert();
      for (const attempt of [insert, () => runtime.transact(insert)]) {
        const error = await rejection(attempt());
        expect(EvlogError.isEvlogError(error) && error.code).toBe(
          postgresErrors.CONSTRAINT_CONFLICT.code,
        );
      }
      expect(
        await rejection(
          runtime.transact(async () => {
            throw domainError;
          }),
        ),
      ).toBe(domainError);
    } finally {
      await cleanupQualificationRows(runtime, [id]);
    }
  });

  test("ordinary Drizzle writes preserve database history effects", async () => {
    const id = crypto.randomUUID();
    const before = `qualification-before-${id}`;
    const after = `qualification-after-${id}`;
    createdIds.add(id);

    try {
      await runtime.query(async (database) => {
        await database.insert(projectTypes).values({ id, name: before, ...timestamps() });
        await database.update(projectTypes).set({ name: after }).where(eq(projectTypes.id, id));

        const history = await database
          .select({
            name: projectTypeHistory.name,
            sysPeriod: projectTypeHistory.sysPeriod,
          })
          .from(projectTypeHistory)
          .where(eq(projectTypeHistory.id, id));

        expect(history.map(({ name }) => name)).toEqual([before]);
        expect(history.every(({ sysPeriod }) => sysPeriod.includes("["))).toBeTrue();
        expect(
          await database
            .select({ name: projectTypes.name })
            .from(projectTypes)
            .where(eq(projectTypes.id, id)),
        ).toEqual([{ name: after }]);
      });
    } finally {
      await cleanupQualificationRows(runtime, [id]);
    }
  });

  test("domain and audit writes commit and roll back atomically", async () => {
    const committedId = crypto.randomUUID();
    const rolledBackId = crypto.randomUUID();
    createdIds.add(committedId);
    createdIds.add(rolledBackId);

    try {
      await runtime.transact(async () => {
        await runtime.query(async (database) => {
          await database.insert(projectTypes).values({
            id: committedId,
            name: `committed-${committedId}`,
            ...timestamps(),
          });
          await database.insert(auditLogs).values({
            id: committedId,
            projectId: committedId,
            entityId: committedId,
            entityType: "project_type",
            changeType: "create",
          });
        });
      });

      expect(
        String(
          await rejection(
            runtime.transact(async () => {
              await runtime.query(async (database) => {
                await database.insert(projectTypes).values({
                  id: rolledBackId,
                  name: `rolled-back-${rolledBackId}`,
                  ...timestamps(),
                });
                await database.insert(auditLogs).values({
                  id: rolledBackId,
                  projectId: rolledBackId,
                  entityId: rolledBackId,
                  entityType: "project_type",
                  changeType: "create",
                });
              });
              throw new Error("intentional rollback");
            }),
          ),
        ),
      ).toContain("intentional rollback");

      const { committed, committedAudit, rolledBack, rolledBackAudit } = await runtime.query(
        async (database) => ({
          committed: await database
            .select({ id: projectTypes.id })
            .from(projectTypes)
            .where(eq(projectTypes.id, committedId)),
          committedAudit: await database
            .select({ id: auditLogs.id })
            .from(auditLogs)
            .where(eq(auditLogs.id, committedId)),
          rolledBack: await database
            .select({ id: projectTypes.id })
            .from(projectTypes)
            .where(eq(projectTypes.id, rolledBackId)),
          rolledBackAudit: await database
            .select({ id: auditLogs.id })
            .from(auditLogs)
            .where(eq(auditLogs.id, rolledBackId)),
        }),
      );

      expect(committed).toEqual([{ id: committedId }]);
      expect(committedAudit).toEqual([{ id: committedId }]);
      expect(rolledBack).toEqual([]);
      expect(rolledBackAudit).toEqual([]);
    } finally {
      await cleanupQualificationRows(runtime, [committedId, rolledBackId]);
    }
  });

  test("rejects nested transactions", async () => {
    const nestedTransact = runtime.transact;
    await runtime.transact(async () => {
      expect(() => nestedTransact(async () => undefined)).toThrow(NestedPostgresTransactionError);
    });
  });

  test("test IDs are unique and targeted cleanup leaves no current or history rows", async () => {
    const ids = [...createdIds];
    expect(new Set(ids).size).toBe(ids.length);
    const residue = await runtime.query(async (database) => ({
      auditLogs: await database
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(inArray(auditLogs.id, ids)),
      projectHistory: await database
        .select({ id: projectHistory.id })
        .from(projectHistory)
        .where(inArray(projectHistory.id, ids)),
      projectTypeHistory: await database
        .select({ id: projectTypeHistory.id })
        .from(projectTypeHistory)
        .where(inArray(projectTypeHistory.id, ids)),
      projectTypes: await database
        .select({ id: projectTypes.id })
        .from(projectTypes)
        .where(inArray(projectTypes.id, ids)),
      projectVersionLocks: await database
        .select({ id: projectVersionLocks.id })
        .from(projectVersionLocks)
        .where(inArray(projectVersionLocks.id, ids)),
      projects: await database
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.id, ids)),
      topicHistory: await database
        .select({ id: topicHistory.id })
        .from(topicHistory)
        .where(inArray(topicHistory.id, ids)),
      topicNormHistory: await database
        .select({ id: topicNormHistory.id })
        .from(topicNormHistory)
        .where(inArray(topicNormHistory.id, ids)),
      topicNorms: await database
        .select({ id: topicNorms.id })
        .from(topicNorms)
        .where(inArray(topicNorms.id, ids)),
      topics: await database.select({ id: topics.id }).from(topics).where(inArray(topics.id, ids)),
    }));
    expect(residue).toEqual({
      auditLogs: [],
      projectHistory: [],
      projectTypeHistory: [],
      projectTypes: [],
      projectVersionLocks: [],
      projects: [],
      topicHistory: [],
      topicNormHistory: [],
      topicNorms: [],
      topics: [],
    });
  });

  test("bounds readiness observers without multiplying work on a saturated maximum-two pool", async () => {
    const saturatedRuntime = createPostgresRuntime({
      url: databaseUrl!,
      schema: qualificationSchema,
      pool: {
        maxConnections: 2,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
        readinessObservationTimeoutMilliseconds: 50,
      },
    });
    const releaseCapacity = Promise.withResolvers<void>();
    const acquired = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const heldTransactions = acquired.map((latch) => {
      const transaction = saturatedRuntime
        .transact(async () => {
          await saturatedRuntime.query(async (database) => {
            await database.select().from(readinessCatalog).limit(1);
          });
          latch.resolve();
          await releaseCapacity.promise;
        })
        .catch((cause: unknown) => {
          latch.reject(cause);
          throw cause;
        });
      void transaction.catch(() => undefined);
      return transaction;
    });
    const unavailable = async (
      promise: Promise<void>,
    ): Promise<PostgresReadinessUnavailableError> => {
      try {
        await promise;
        throw new Error("readiness unexpectedly succeeded while saturated");
      } catch (error) {
        if (error instanceof PostgresReadinessUnavailableError) return error;
        throw error;
      }
    };

    try {
      await Promise.all(acquired.map(({ promise }) => promise));
      const started = performance.now();
      const firstObservers = await Promise.all([
        unavailable(saturatedRuntime.ready()),
        unavailable(saturatedRuntime.ready()),
        unavailable(saturatedRuntime.ready()),
      ]);
      const elapsed = performance.now() - started;

      expect(firstObservers.map(({ reason }) => reason)).toEqual(
        Array.from({ length: 3 }, () => "response_deadline_exceeded"),
      );
      expect(elapsed).toBeGreaterThanOrEqual(25);
      expect(elapsed).toBeLessThan(1_000);
      expect((await unavailable(saturatedRuntime.ready())).reason).toBe(
        "response_deadline_exceeded",
      );
      releaseCapacity.resolve();
      await Promise.all(heldTransactions);
      await saturatedRuntime.ready();
      await saturatedRuntime.ready();
    } finally {
      releaseCapacity.resolve();
      await Promise.allSettled(heldTransactions);
      await saturatedRuntime.close();
    }
  });

  test("close is idempotent and rejects later use", async () => {
    const closeRuntime = createPostgresRuntime({
      url: databaseUrl!,
      schema: qualificationSchema,
    });
    try {
      await Promise.all([closeRuntime.close(), closeRuntime.close(), closeRuntime.close()]);
      expect(String(await rejection(closeRuntime.ready()))).toContain("closed");
    } finally {
      await closeRuntime.close();
    }
  });
});
