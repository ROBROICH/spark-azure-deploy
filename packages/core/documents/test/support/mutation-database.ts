import { SQL } from "bun";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";

import {
  projectHistory,
  projectLogicSchema,
  projects,
  projectVersionLocks,
} from "../../../projects/src/db/schema.ts";
import {
  documentManagementSchema,
  fileHistory,
  fileTopicHistory,
  fileTopics,
  files,
  zipFileDiffEntries,
  zipFileHistory,
  zipFiles,
} from "../../src/db/schema.ts";

export interface MutationDatabase {
  readonly client: SQL;
  readonly db: BunSQLDatabase<typeof documentManagementSchema>;
  readonly projects: BunSQLDatabase<typeof projectLogicSchema>;
}

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.DMS_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error("DMS_MUTATION_DATABASE_URL must name the prepared DMS database");
  }
  const client = new SQL(url, { max: 2, prepare: false });
  return {
    client,
    db: drizzle({ client, schema: documentManagementSchema }),
    projects: drizzle({ client, schema: projectLogicSchema }),
  };
}

export interface MutationProject {
  readonly id: string;
  readonly projectVersion: number;
}

export async function seedMutationProjects(
  database: MutationDatabase,
  projectRows: readonly MutationProject[],
): Promise<void> {
  const byId = new Map(projectRows.map((project) => [project.id, project]));
  const ids = [...byId.keys()];
  if (ids.length === 0) return;
  await database.projects.transaction(async (transaction) => {
    await transaction
      .delete(projectVersionLocks)
      .where(inArray(projectVersionLocks.projectId, ids));
    await transaction.delete(projects).where(inArray(projects.id, ids));
    await transaction.delete(projectHistory).where(inArray(projectHistory.id, ids));
    await transaction.insert(projects).values(
      [...byId.values()].map(({ id, projectVersion }) => ({
        id,
        projectVersion,
        createdById: "82000000-0000-4000-8000-000000000001",
      })),
    );
  });
}

export async function setMutationProjectLock(
  database: MutationDatabase,
  input: {
    readonly projectId: string;
    readonly sourceVersion: number;
    readonly targetVersion: number;
    readonly lockToken: string;
  },
): Promise<void> {
  await database.projects.transaction(async (transaction) => {
    await transaction
      .delete(projectVersionLocks)
      .where(eq(projectVersionLocks.projectId, input.projectId));
    await transaction.insert(projectVersionLocks).values({
      id: crypto.randomUUID(),
      ...input,
    });
  });
}

export async function readMutationProjectState(database: MutationDatabase, projectId: string) {
  const fileRows = await database.db
    .select()
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.projectVersion), asc(files.id));
  const fileHistoryRows = await database.db
    .select()
    .from(fileHistory)
    .where(eq(fileHistory.projectId, projectId))
    .orderBy(asc(fileHistory.projectVersion), asc(fileHistory.id));
  const topicRows = await database.db
    .select()
    .from(fileTopics)
    .where(eq(fileTopics.projectId, projectId))
    .orderBy(asc(fileTopics.projectVersion), asc(fileTopics.id));
  const topicHistoryRows = await database.db
    .select()
    .from(fileTopicHistory)
    .where(eq(fileTopicHistory.projectId, projectId))
    .orderBy(asc(fileTopicHistory.projectVersion), asc(fileTopicHistory.id));
  const zipRows = await database.db
    .select()
    .from(zipFiles)
    .where(eq(zipFiles.projectId, projectId))
    .orderBy(asc(zipFiles.projectVersion), asc(zipFiles.id));
  const zipHistoryRows = await database.db
    .select()
    .from(zipFileHistory)
    .where(eq(zipFileHistory.projectId, projectId))
    .orderBy(asc(zipFileHistory.projectVersion), asc(zipFileHistory.id));
  const zipIds = [...new Set([...zipRows, ...zipHistoryRows].map(({ id }) => id))];
  const diffRows =
    zipIds.length === 0
      ? []
      : await database.db
          .select()
          .from(zipFileDiffEntries)
          .where(inArray(zipFileDiffEntries.zipFileId, zipIds))
          .orderBy(asc(zipFileDiffEntries.projectVersion), asc(zipFileDiffEntries.entryKey));
  const auditRows = await database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.projectId, projectId))
    .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));

  return {
    audit: auditRows,
    fileHistory: fileHistoryRows,
    files: fileRows,
    fileTopicHistory: topicHistoryRows,
    fileTopics: topicRows,
    zipFileDiffEntries: diffRows,
    zipFileHistory: zipHistoryRows,
    zipFiles: zipRows,
  };
}

export async function cleanupMutationProjects(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return;

  const zipIds = (
    await database.db
      .select({ id: zipFiles.id })
      .from(zipFiles)
      .where(inArray(zipFiles.projectId, ids))
  ).map(({ id }) => id);

  await database.db.transaction(async (transaction) => {
    if (zipIds.length > 0) {
      await transaction
        .delete(zipFileDiffEntries)
        .where(inArray(zipFileDiffEntries.zipFileId, zipIds));
    }
    await transaction.delete(fileTopics).where(inArray(fileTopics.projectId, ids));
    await transaction.delete(files).where(inArray(files.projectId, ids));
    await transaction.delete(zipFiles).where(inArray(zipFiles.projectId, ids));
    await transaction.delete(auditLogs).where(inArray(auditLogs.projectId, ids));

    await transaction.delete(fileTopicHistory).where(inArray(fileTopicHistory.projectId, ids));
    await transaction.delete(fileHistory).where(inArray(fileHistory.projectId, ids));
    await transaction.delete(zipFileHistory).where(inArray(zipFileHistory.projectId, ids));
  });
  await database.projects.transaction(async (transaction) => {
    await transaction
      .delete(projectVersionLocks)
      .where(inArray(projectVersionLocks.projectId, ids));
    await transaction.delete(projects).where(inArray(projects.id, ids));
    await transaction.delete(projectHistory).where(inArray(projectHistory.id, ids));
  });
}

export async function assertMutationProjectsAbsent(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  for (const projectId of new Set(projectIds)) {
    const state = await readMutationProjectState(database, projectId);
    if (Object.values(state).some((rows) => rows.length !== 0)) {
      throw new Error(`DMS mutation scenario ${projectId} retained database rows`);
    }
  }
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return;
  const [projectRows, lockRows, historyRows] = await Promise.all([
    database.projects.select({ id: projects.id }).from(projects).where(inArray(projects.id, ids)),
    database.projects
      .select({ id: projectVersionLocks.id })
      .from(projectVersionLocks)
      .where(inArray(projectVersionLocks.projectId, ids)),
    database.projects
      .select({ id: projectHistory.id })
      .from(projectHistory)
      .where(inArray(projectHistory.id, ids)),
  ]);
  if (projectRows.length > 0 || lockRows.length > 0 || historyRows.length > 0) {
    throw new Error("DMS mutation scenario retained core project rows");
  }
}
