import { createPostgresRuntime, type PostgresRuntime } from "@spark-workflow/postgres-runtime";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { coreSchema } from "@spark-workflow/core/schema";
import { asc, eq, inArray } from "drizzle-orm";

import {
  argumentHistory,
  argumentsTable,
  beteiligungsEingaenge,
  beteiligungsEingangHistory,
  beteiligungsEingangMarkdown,
  beteiligungsEingangMarkdownHistory,
  objectionsSchema,
} from "../../src/db/schema.ts";

const coreProjectHistory = coreSchema.projectHistory;
const coreProjects = coreSchema.projects;
const coreProjectVersionLocks = coreSchema.projectVersionLocks;
const mutationSchema = {
  ...objectionsSchema,
  coreProjectHistory,
  coreProjects,
  coreProjectVersionLocks,
};

export type MutationDatabase = PostgresRuntime<typeof mutationSchema>;

const CORE_TEST_USER_ID = "51000000-0000-4000-8000-000000000099";

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.OBJECTIONS_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error("OBJECTIONS_MUTATION_DATABASE_URL must name the prepared Objections database");
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
        name: `Objections test ${projectId}`,
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

const byProjectVersionAndId = <
  Row extends { projectId: string; projectVersion: number | null; id: string },
>(
  rows: Row[],
): Row[] =>
  rows.sort((left, right) => {
    const byProject = left.projectId.localeCompare(right.projectId);
    if (byProject !== 0) return byProject;
    const byVersion = (left.projectVersion ?? -1) - (right.projectVersion ?? -1);
    if (byVersion !== 0) return byVersion;
    return left.id.localeCompare(right.id);
  });

export async function readProjectState(database: MutationDatabase, projectId: string) {
  return database.query(async (query) => {
    const entries = await query
      .select({
        id: beteiligungsEingaenge.id,
        projectId: beteiligungsEingaenge.projectId,
        projectVersion: beteiligungsEingaenge.projectVersion,
        fileId: beteiligungsEingaenge.fileId,
        filename: beteiligungsEingaenge.filename,
        markdownId: beteiligungsEingaenge.markdownId,
        beteiligungTyp: beteiligungsEingaenge.beteiligungTyp,
        extractionStatus: beteiligungsEingaenge.extractionStatus,
        classificationStatus: beteiligungsEingaenge.classificationStatus,
        frontendParentIds: beteiligungsEingaenge.frontendParentIds,
        updateType: beteiligungsEingaenge.updateType,
        isDeleted: beteiligungsEingaenge.isDeleted,
        isOutdated: beteiligungsEingaenge.isOutdated,
        createdAt: beteiligungsEingaenge.createdAt,
        updatedAt: beteiligungsEingaenge.updatedAt,
      })
      .from(beteiligungsEingaenge)
      .where(eq(beteiligungsEingaenge.projectId, projectId))
      .orderBy(asc(beteiligungsEingaenge.projectVersion), asc(beteiligungsEingaenge.id));
    const markdown = await query
      .select({
        id: beteiligungsEingangMarkdown.id,
        projectId: beteiligungsEingangMarkdown.projectId,
        projectVersion: beteiligungsEingangMarkdown.projectVersion,
        beteiligungsEingangId: beteiligungsEingangMarkdown.beteiligungsEingangId,
        text: beteiligungsEingangMarkdown.text,
        isDeleted: beteiligungsEingangMarkdown.isDeleted,
        isOutdated: beteiligungsEingangMarkdown.isOutdated,
        createdAt: beteiligungsEingangMarkdown.createdAt,
        updatedAt: beteiligungsEingangMarkdown.updatedAt,
      })
      .from(beteiligungsEingangMarkdown)
      .where(eq(beteiligungsEingangMarkdown.projectId, projectId))
      .orderBy(
        asc(beteiligungsEingangMarkdown.projectVersion),
        asc(beteiligungsEingangMarkdown.id),
      );
    const argumentsRows = await query
      .select({
        id: argumentsTable.id,
        projectId: argumentsTable.projectId,
        projectVersion: argumentsTable.projectVersion,
        beteiligungsEingangId: argumentsTable.beteiligungsEingangId,
        topicId: argumentsTable.topicId,
        subTopicId: argumentsTable.subTopicId,
        topicConfidence: argumentsTable.topicConfidence,
        subTopicConfidence: argumentsTable.subTopicConfidence,
        status: argumentsTable.status,
        text: argumentsTable.text,
        startIdx: argumentsTable.startIdx,
        endIdx: argumentsTable.endIdx,
        context: argumentsTable.context,
        contextStartIdx: argumentsTable.contextStartIdx,
        contextEndIdx: argumentsTable.contextEndIdx,
        argumentId: argumentsTable.argumentId,
        erwiderung: argumentsTable.erwiderung,
        einordnung: argumentsTable.einordnung,
        inVae: argumentsTable.inVae,
        isValidArgument: argumentsTable.isValidArgument,
        frontendParentIds: argumentsTable.frontendParentIds,
        updateType: argumentsTable.updateType,
        isDeleted: argumentsTable.isDeleted,
        isOutdated: argumentsTable.isOutdated,
        createdAt: argumentsTable.createdAt,
        updatedAt: argumentsTable.updatedAt,
      })
      .from(argumentsTable)
      .where(eq(argumentsTable.projectId, projectId))
      .orderBy(asc(argumentsTable.projectVersion), asc(argumentsTable.id));
    const entryHistory = await query
      .select({
        id: beteiligungsEingangHistory.id,
        projectId: beteiligungsEingangHistory.projectId,
        projectVersion: beteiligungsEingangHistory.projectVersion,
        fileId: beteiligungsEingangHistory.fileId,
        markdownId: beteiligungsEingangHistory.markdownId,
        extractionStatus: beteiligungsEingangHistory.extractionStatus,
        classificationStatus: beteiligungsEingangHistory.classificationStatus,
        isDeleted: beteiligungsEingangHistory.isDeleted,
        isOutdated: beteiligungsEingangHistory.isOutdated,
        updatedAt: beteiligungsEingangHistory.updatedAt,
      })
      .from(beteiligungsEingangHistory)
      .where(eq(beteiligungsEingangHistory.projectId, projectId));
    const markdownHistory = await query
      .select({
        id: beteiligungsEingangMarkdownHistory.id,
        projectId: beteiligungsEingangMarkdownHistory.projectId,
        projectVersion: beteiligungsEingangMarkdownHistory.projectVersion,
        beteiligungsEingangId: beteiligungsEingangMarkdownHistory.beteiligungsEingangId,
        text: beteiligungsEingangMarkdownHistory.text,
        isDeleted: beteiligungsEingangMarkdownHistory.isDeleted,
        isOutdated: beteiligungsEingangMarkdownHistory.isOutdated,
        updatedAt: beteiligungsEingangMarkdownHistory.updatedAt,
      })
      .from(beteiligungsEingangMarkdownHistory)
      .where(eq(beteiligungsEingangMarkdownHistory.projectId, projectId));
    const argumentsHistory = await query
      .select({
        id: argumentHistory.id,
        projectId: argumentHistory.projectId,
        projectVersion: argumentHistory.projectVersion,
        beteiligungsEingangId: argumentHistory.beteiligungsEingangId,
        topicId: argumentHistory.topicId,
        subTopicId: argumentHistory.subTopicId,
        topicConfidence: argumentHistory.topicConfidence,
        subTopicConfidence: argumentHistory.subTopicConfidence,
        status: argumentHistory.status,
        argumentId: argumentHistory.argumentId,
        erwiderung: argumentHistory.erwiderung,
        isDeleted: argumentHistory.isDeleted,
        isOutdated: argumentHistory.isOutdated,
        updatedAt: argumentHistory.updatedAt,
      })
      .from(argumentHistory)
      .where(eq(argumentHistory.projectId, projectId));
    const audit = await query
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.projectId, projectId))
      .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));

    return {
      entries,
      markdown,
      arguments: argumentsRows,
      entryHistory: byProjectVersionAndId(entryHistory),
      markdownHistory: byProjectVersionAndId(markdownHistory),
      argumentHistory: byProjectVersionAndId(argumentsHistory),
      audit,
    };
  });
}

export async function cleanupProjects(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  if (projectIds.length === 0) return;
  const ids = [...projectIds];
  await database.transact(async () => {
    await database.query(async (query) => {
      await query.delete(argumentsTable).where(inArray(argumentsTable.projectId, ids));
      await query
        .delete(beteiligungsEingangMarkdown)
        .where(inArray(beteiligungsEingangMarkdown.projectId, ids));
      await query
        .delete(beteiligungsEingaenge)
        .where(inArray(beteiligungsEingaenge.projectId, ids));
      await query.delete(argumentHistory).where(inArray(argumentHistory.projectId, ids));
      await query
        .delete(beteiligungsEingangMarkdownHistory)
        .where(inArray(beteiligungsEingangMarkdownHistory.projectId, ids));
      await query
        .delete(beteiligungsEingangHistory)
        .where(inArray(beteiligungsEingangHistory.projectId, ids));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, ids));
      await query
        .delete(coreProjectVersionLocks)
        .where(inArray(coreProjectVersionLocks.projectId, ids));
      await query.delete(coreProjects).where(inArray(coreProjects.id, ids));
      await query.delete(coreProjectHistory).where(inArray(coreProjectHistory.id, ids));
    });
  });
}

export async function assertProjectsAbsent(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  for (const projectId of projectIds) {
    const state = await readProjectState(database, projectId);
    if (Object.values(state).some((rows) => rows.length > 0)) {
      throw new Error("Objections mutation project retained rows: " + projectId);
    }
    const coreRows = await database.query(async (query) =>
      query
        .select({ id: coreProjects.id })
        .from(coreProjects)
        .where(eq(coreProjects.id, projectId)),
    );
    if (coreRows.length > 0) {
      throw new Error("Objections mutation project retained core rows: " + projectId);
    }
  }
}
