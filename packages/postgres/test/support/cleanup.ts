import { inArray } from "drizzle-orm";

import type { PostgresRuntime } from "../../src";
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
} from "./schema";

export async function cleanupQualificationRows(
  runtime: Pick<
    PostgresRuntime<typeof qualificationSchema>,
    "query" | "transact"
  >,
  ownedIds: Iterable<string>,
): Promise<void> {
  const ids = [...new Set(ownedIds)];
  if (ids.length === 0) return;

  await runtime.transact(async () => {
    await runtime.query(async (database) => {
      await database.delete(auditLogs).where(inArray(auditLogs.id, ids));
      await database.delete(topicNorms).where(inArray(topicNorms.id, ids));
      await database.delete(topics).where(inArray(topics.id, ids));
      await database
        .delete(projectVersionLocks)
        .where(inArray(projectVersionLocks.id, ids));
      await database.delete(projects).where(inArray(projects.id, ids));
      await database.delete(projectTypes).where(inArray(projectTypes.id, ids));

      await database
        .delete(topicNormHistory)
        .where(inArray(topicNormHistory.id, ids));
      await database
        .delete(topicHistory)
        .where(inArray(topicHistory.id, ids));
      await database
        .delete(projectHistory)
        .where(inArray(projectHistory.id, ids));
      await database
        .delete(projectTypeHistory)
        .where(inArray(projectTypeHistory.id, ids));
    });
  });
}
