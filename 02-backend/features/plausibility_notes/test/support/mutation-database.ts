import { createPostgresRuntime, type PostgresRuntime } from "@spark-workflow/postgres-runtime";
import { coreSchema } from "@spark-workflow/core/schema";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import type { Static } from "@sinclair/typebox";
import { asc, eq, inArray } from "drizzle-orm";

import {
  plausibilityNoteHistory,
  plausibilityNoteOccurrenceHistory,
  plausibilityNoteOccurrences,
  plausibilityNotes,
  plausibilitySchema,
} from "../../src/db/schema.ts";
import { PlausibilityCheckResultSchema } from "../../src/schemas.ts";

const coreProjectHistory = coreSchema.projectHistory;
const coreProjects = coreSchema.projects;
const coreProjectVersionLocks = coreSchema.projectVersionLocks;
const mutationSchema = {
  ...plausibilitySchema,
  coreProjectHistory,
  coreProjects,
  coreProjectVersionLocks,
};

export type MutationDatabase = PostgresRuntime<typeof mutationSchema>;

type PlausibilityResult = Static<typeof PlausibilityCheckResultSchema>;

const CORE_TEST_USER_ID = "51000000-0000-4000-8000-000000000099";

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.PLAUSIBILITY_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error(
      "PLAUSIBILITY_MUTATION_DATABASE_URL must name the prepared Plausibility database",
    );
  }
  return createPostgresRuntime({
    url,
    schema: mutationSchema,
    pool: {
      maxConnections: 1,
      idleTimeoutSeconds: 30,
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
        name: `Plausibility test ${projectId}`,
        createdById: CORE_TEST_USER_ID,
        rootProjectId: projectId,
      })
      .onConflictDoNothing();
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

export async function clearCoreVersionLock(
  database: MutationDatabase,
  projectId: string,
): Promise<void> {
  await database.query(async (query) => {
    await query
      .delete(coreProjectVersionLocks)
      .where(eq(coreProjectVersionLocks.projectId, projectId));
  });
}

export async function seedPlausibilityResult(
  database: MutationDatabase,
  projectId: string,
  projectVersion: number,
  result: PlausibilityResult,
): Promise<void> {
  await database.transact(async () => {
    await database.query(async (query) => {
      if (result.contradictions.length === 0) return;
      await query.insert(plausibilityNotes).values(
        result.contradictions.map((contradiction) => ({
          id: contradiction.id,
          projectId,
          projectVersion,
          title: contradiction.title,
          description: contradiction.description,
          rating: contradiction.rating,
          confidenceScore: contradiction.confidenceScore ?? null,
          scoreA: contradiction.scoreA ?? null,
          scoreB: contradiction.scoreB ?? null,
          evidence: contradiction.evidence ?? null,
          mergedCount: contradiction.mergedCount ?? null,
          status: contradiction.status,
        })),
      );
      const occurrences = result.contradictions.flatMap((contradiction) =>
        contradiction.occurrences.map((occurrence) => ({
          id: crypto.randomUUID(),
          projectId,
          projectVersion,
          plausibilityNoteId: contradiction.id,
          documentId: occurrence.documentId,
          documentName: occurrence.documentName,
          contentExcerpt: occurrence.contentExcerpt,
          pageNumber: occurrence.pageNumber,
          contradiction: occurrence.contradiction ?? null,
        })),
      );
      if (occurrences.length > 0) {
        await query.insert(plausibilityNoteOccurrences).values(occurrences);
      }
    });
  });
}

export async function readProjectState(database: MutationDatabase, projectId: string) {
  return database.query(async (query) => {
    const notes = await query
      .select()
      .from(plausibilityNotes)
      .where(eq(plausibilityNotes.projectId, projectId))
      .orderBy(asc(plausibilityNotes.projectVersion), asc(plausibilityNotes.id));
    const occurrences = await query
      .select()
      .from(plausibilityNoteOccurrences)
      .where(eq(plausibilityNoteOccurrences.projectId, projectId))
      .orderBy(
        asc(plausibilityNoteOccurrences.projectVersion),
        asc(plausibilityNoteOccurrences.id),
      );
    const noteHistory = await query
      .select()
      .from(plausibilityNoteHistory)
      .where(eq(plausibilityNoteHistory.projectId, projectId));
    const occurrenceHistory = await query
      .select()
      .from(plausibilityNoteOccurrenceHistory)
      .where(eq(plausibilityNoteOccurrenceHistory.projectId, projectId));
    const audit = await query
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.projectId, projectId))
      .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));

    return {
      notes,
      occurrences,
      noteHistory: noteHistory.sort(compareHistoryRows),
      occurrenceHistory: occurrenceHistory.sort(compareHistoryRows),
      audit,
    };
  });
}

function compareHistoryRows(
  left: { id: string; projectVersion: number | null; sysPeriod: string },
  right: { id: string; projectVersion: number | null; sysPeriod: string },
): number {
  return (
    (left.projectVersion ?? 0) - (right.projectVersion ?? 0) ||
    left.id.localeCompare(right.id) ||
    left.sysPeriod.localeCompare(right.sysPeriod)
  );
}

export async function cleanupMutationScenario(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  if (projectIds.length === 0) return;

  await database.transact(async () => {
    await database.query(async (query) => {
      await query
        .delete(plausibilityNoteOccurrences)
        .where(inArray(plausibilityNoteOccurrences.projectId, [...projectIds]));
      await query
        .delete(plausibilityNotes)
        .where(inArray(plausibilityNotes.projectId, [...projectIds]));
      await query
        .delete(plausibilityNoteOccurrenceHistory)
        .where(inArray(plausibilityNoteOccurrenceHistory.projectId, [...projectIds]));
      await query
        .delete(plausibilityNoteHistory)
        .where(inArray(plausibilityNoteHistory.projectId, [...projectIds]));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, [...projectIds]));
      await query
        .delete(coreProjectVersionLocks)
        .where(inArray(coreProjectVersionLocks.projectId, [...projectIds]));
      await query.delete(coreProjects).where(inArray(coreProjects.id, [...projectIds]));
      await query.delete(coreProjectHistory).where(inArray(coreProjectHistory.id, [...projectIds]));
    });
  });
}

export async function assertMutationScenarioAbsent(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  for (const projectId of projectIds) {
    const state = await readProjectState(database, projectId);
    if (Object.values(state).some((rows) => rows.length > 0)) {
      throw new Error(`Mutation scenario state remained for project ${projectId}`);
    }
    const coreRows = await database.query(async (query) =>
      query.select({ id: coreProjects.id }).from(coreProjects).where(eq(coreProjects.id, projectId)),
    );
    if (coreRows.length > 0) {
      throw new Error(`Mutation scenario retained core project state for ${projectId}`);
    }
  }
}
