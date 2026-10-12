import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { coreSchema } from "@spark-workflow/core/schema";
import { and, asc, eq } from "drizzle-orm";

import { feedback, feedbackHistory, feedbackSchema } from "../../src/db/schema";

const coreProjectHistory = coreSchema.projectHistory;
const coreProjects = coreSchema.projects;
const coreProjectVersionLocks = coreSchema.projectVersionLocks;
const mutationSchema = {
  ...feedbackSchema,
  coreProjectHistory,
  coreProjects,
  coreProjectVersionLocks,
};

export type MutationDatabase = PostgresResourceRuntime<typeof mutationSchema>;

const CORE_TEST_USER_ID = "51000000-0000-4000-8000-000000000099";

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.FEEDBACK_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error("FEEDBACK_MUTATION_DATABASE_URL must name the prepared mutation database");
  }
  return createPostgresRuntime({
    url,
    schema: mutationSchema,
    pool: {
      maxConnections: 4,
      idleTimeoutSeconds: 5,
      connectionTimeoutSeconds: 5,
      maxLifetimeSeconds: 120,
      closeTimeoutSeconds: 5,
    },
  });
}

export async function seedCoreProjectVersion(
  database: MutationDatabase,
  projectId: string,
  projectVersion: number,
): Promise<void> {
  await database.query(async (query) => {
    await query
      .insert(coreProjects)
      .values({
        id: projectId,
        projectVersion,
        name: `Feedback test ${projectId}`,
        createdById: CORE_TEST_USER_ID,
        rootProjectId: projectId,
      })
      .onConflictDoNothing();
  });
}

export async function deleteCoreProjectVersion(
  database: MutationDatabase,
  projectId: string,
  projectVersion: number,
): Promise<void> {
  await database.query(async (query) => {
    await query
      .delete(coreProjects)
      .where(
        and(eq(coreProjects.id, projectId), eq(coreProjects.projectVersion, projectVersion)),
      );
  });
}

export async function setCoreVersionLock(
  database: MutationDatabase,
  projectId: string,
  lock: { sourceVersion: number; targetVersion: number; lockToken: string },
): Promise<void> {
  await database.transact(async () => {
    await database.query(async (query) => {
      await query
        .delete(coreProjectVersionLocks)
        .where(eq(coreProjectVersionLocks.projectId, projectId));
      await query.insert(coreProjectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId,
        sourceVersion: lock.sourceVersion,
        targetVersion: lock.targetVersion,
        lockToken: lock.lockToken,
      });
    });
  });
}

export async function readProjectState(database: MutationDatabase, projectId: string) {
  const [current, history] = await database.query(async (query) =>
    Promise.all([
    query
      .select({
        id: feedback.id,
        projectId: feedback.projectId,
        projectVersion: feedback.projectVersion,
        isDeleted: feedback.isDeleted,
        isOutdated: feedback.isOutdated,
        frontendParentIds: feedback.frontendParentIds,
        updateType: feedback.updateType,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
        rating: feedback.rating,
        reason: feedback.reason,
        text: feedback.text,
        userId: feedback.userId,
      })
      .from(feedback)
      .where(eq(feedback.projectId, projectId))
      .orderBy(asc(feedback.projectVersion), asc(feedback.id)),
    query
      .select({
        id: feedbackHistory.id,
        projectId: feedbackHistory.projectId,
        projectVersion: feedbackHistory.projectVersion,
        isDeleted: feedbackHistory.isDeleted,
        isOutdated: feedbackHistory.isOutdated,
        frontendParentIds: feedbackHistory.frontendParentIds,
        updateType: feedbackHistory.updateType,
        createdAt: feedbackHistory.createdAt,
        updatedAt: feedbackHistory.updatedAt,
        rating: feedbackHistory.rating,
        reason: feedbackHistory.reason,
        text: feedbackHistory.text,
        userId: feedbackHistory.userId,
      })
      .from(feedbackHistory)
      .where(eq(feedbackHistory.projectId, projectId))
      .orderBy(
        asc(feedbackHistory.projectVersion),
        asc(feedbackHistory.id),
        asc(feedbackHistory.updatedAt),
      ),
    ]),
  );
  return { current, history };
}

export async function countProjectVersionRows(
  database: MutationDatabase,
  projectId: string,
  projectVersion: number,
): Promise<number> {
  return database.query(async (query) =>
    query.$count(
      feedback,
      and(eq(feedback.projectId, projectId), eq(feedback.projectVersion, projectVersion)),
    ),
  );
}

export async function cleanupMutationScenario(
  database: MutationDatabase,
  projectId: string,
): Promise<void> {
  await database.transact(async () => {
    await database.query(async (query) => {
      await query.delete(feedback).where(eq(feedback.projectId, projectId));
      await query.delete(feedbackHistory).where(eq(feedbackHistory.projectId, projectId));
      await query
        .delete(coreProjectVersionLocks)
        .where(eq(coreProjectVersionLocks.projectId, projectId));
      await query.delete(coreProjects).where(eq(coreProjects.id, projectId));
      await query.delete(coreProjectHistory).where(eq(coreProjectHistory.id, projectId));
    });
  });
}

export async function assertProjectAbsent(
  database: MutationDatabase,
  projectId: string,
): Promise<void> {
  const state = await readProjectState(database, projectId);
  if (state.current.length !== 0 || state.history.length !== 0) {
    throw new Error(`Feedback mutation scenario ${projectId} retained database rows`);
  }
  const coreRows = await database.query(async (query) =>
    query.select({ id: coreProjects.id }).from(coreProjects).where(eq(coreProjects.id, projectId)),
  );
  if (coreRows.length !== 0) {
    throw new Error(`Feedback mutation scenario ${projectId} retained core project rows`);
  }
}
