import { fileHistory, files } from "@spark-workflow/core/documents/schema";
import { projectHistory, projects, topicHistory, topics } from "@spark-workflow/core/projects/schema";
import { createPostgresRuntime, type PostgresRuntime } from "@spark-workflow/postgres-runtime";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { asc, eq, inArray } from "drizzle-orm";
import {
  boolean,
  customType,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

const priority = pgEnum("priority", ["must", "should"]);
const processStep = pgEnum("processstep", [
  "formalCompletenessCheck",
  "plausibilityCheck",
  "materialCompletenessCheck",
  "legalReview",
]);
const sourceType = pgEnum("sourcetype", [
  "tableOfContents",
  "requiredDocuments",
  "contradiction",
  "materialLaw",
  "materialNorm",
  "materialSatz",
  "materialFundstelle",
  "manual",
]);

const requestColumns = () => ({
  projectId: uuid("project_id").notNull(),
  title: varchar("title", { length: 2_000 }).notNull(),
  reason: varchar("reason", { length: 2_000 }).notNull(),
  priority: priority("priority").notNull(),
  processStep: processStep("process_step"),
  sourceType: sourceType("source_type"),
  sourceItemId: varchar("source_item_id", { length: 255 }),
  includedInLetter: boolean("included_in_letter").notNull(),
  topicId: uuid("topic_id"),
  documentId: uuid("document_id"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const supplementaryRequests = pgTable("supplementary_request", {
  id: uuid("id").primaryKey(),
  ...requestColumns(),
});

export const supplementaryRequestHistory = pgTable("supplementary_request_history", {
  id: uuid("id").notNull(),
  ...requestColumns(),
});

const mutationSchema = {
  auditLogs,
  fileHistory,
  files,
  projectHistory,
  projects,
  supplementaryRequestHistory,
  supplementaryRequests,
  topicHistory,
  topics,
};

export type MutationDatabase = PostgresRuntime<typeof mutationSchema>;

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.SUPPLEMENTARY_REQUESTS_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error(
      "SUPPLEMENTARY_REQUESTS_MUTATION_DATABASE_URL must name the prepared Supplementary Requests database",
    );
  }
  return createPostgresRuntime({
    url,
    schema: mutationSchema,
    pool: {
      maxConnections: 2,
      idleTimeoutSeconds: 5,
      connectionTimeoutSeconds: 5,
      maxLifetimeSeconds: 120,
      closeTimeoutSeconds: 5,
    },
  });
}

export async function readProjectState(database: MutationDatabase, projectId: string) {
  return database.query(async (query) => {
  const current = await query
    .select()
    .from(supplementaryRequests)
    .where(eq(supplementaryRequests.projectId, projectId))
    .orderBy(asc(supplementaryRequests.createdAt), asc(supplementaryRequests.id));
  const history = await query
    .select()
    .from(supplementaryRequestHistory)
    .where(eq(supplementaryRequestHistory.projectId, projectId))
    .orderBy(
      asc(supplementaryRequestHistory.createdAt),
      asc(supplementaryRequestHistory.updatedAt),
      asc(supplementaryRequestHistory.id),
    );
  const audit = await query
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.projectId, projectId))
    .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));
    return { current, history, audit };
  });
}

export async function seedReferences(database: MutationDatabase, projectId: string) {
  const topicId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  await database.query(async (query) => {
    await query
      .insert(projects)
      .values({ id: projectId, createdById: crypto.randomUUID() })
      .onConflictDoNothing();
    await query.insert(topics).values({
      id: topicId,
      projectId,
      name: "Test topic",
      showInMvp: true,
      showInEwm: true,
      showInBeschluss: true,
    });
    await query.insert(files).values({
      id: documentId,
      projectId,
      type: "DOCUMENT",
      filename: "test.pdf",
      mimeType: "application/pdf",
      bucketPath: `${projectId}/${documentId}.pdf`,
      isDeleted: false,
    });
  });
  return { topicId, documentId };
}

export async function cleanupProjects(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  if (projectIds.length === 0) return;
  const ids = [...projectIds];
  await database.transact(async () => {
    await database.query(async (query) => {
      await query
        .delete(supplementaryRequests)
        .where(inArray(supplementaryRequests.projectId, ids));
      await query
        .delete(supplementaryRequestHistory)
        .where(inArray(supplementaryRequestHistory.projectId, ids));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, ids));
      await query.delete(files).where(inArray(files.projectId, ids));
      await query.delete(fileHistory).where(inArray(fileHistory.projectId, ids));
      await query.delete(topics).where(inArray(topics.projectId, ids));
      await query.delete(topicHistory).where(inArray(topicHistory.projectId, ids));
      await query.delete(projects).where(inArray(projects.id, ids));
      await query.delete(projectHistory).where(inArray(projectHistory.id, ids));
    });
  });
}

export async function assertProjectsAbsent(
  database: MutationDatabase,
  projectIds: readonly string[],
): Promise<void> {
  for (const projectId of projectIds) {
    const state = await readProjectState(database, projectId);
    if (state.current.length || state.history.length || state.audit.length) {
      throw new Error(`Supplementary Requests mutation project retained rows: ${projectId}`);
    }
  }
}
