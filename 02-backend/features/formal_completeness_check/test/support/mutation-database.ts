import { createPostgresRuntime, type PostgresRuntime } from "@spark-workflow/postgres-runtime";
import { coreSchema } from "@spark-workflow/core/schema";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

const coreProjects = coreSchema.projects;
const coreProjectTypes = coreSchema.projectTypes;
const coreProjectVersionLocks = coreSchema.projectVersionLocks;

const currentNodeColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
  isDeleted: boolean("is_deleted").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  updateType: varchar("update_type"),
  isOutdated: boolean("is_outdated").notNull(),
});

const historyNodeColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
  isDeleted: boolean("is_deleted"),
  frontendParentIds: varchar("frontend_parent_ids").array(),
  updateType: varchar("update_type"),
  isOutdated: boolean("is_outdated"),
});

export const categories = pgTable("category", {
  ...currentNodeColumns(),
  name: varchar("name").notNull(),
});
export const categoryHistory = pgTable("category_history", {
  ...historyNodeColumns(),
  name: varchar("name").notNull(),
});
export const documentTypes = pgTable("document_type", {
  ...currentNodeColumns(),
  categoryId: uuid("category_id"),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  confidence: doublePrecision("confidence"),
  isResolved: boolean("is_resolved").notNull(),
  origin: varchar("origin").notNull(),
});
export const documentTypeHistory = pgTable("document_type_history", {
  ...historyNodeColumns(),
  categoryId: uuid("category_id"),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  confidence: doublePrecision("confidence"),
  isResolved: boolean("is_resolved").notNull(),
  origin: varchar("origin").notNull(),
});
export const documents = pgTable("document", {
  ...currentNodeColumns(),
  fileId: uuid("file_id"),
  aiDocumentTypeId: uuid("ai_suggested_required_document_type_id"),
  humanDocumentTypeId: uuid("human_required_document_type_id"),
  contentExtractionId: uuid("content_extraction_id"),
  documentName: varchar("document_name").notNull(),
  reasoning: text("reasoning"),
  confidence: doublePrecision("confidence"),
});
export const documentHistory = pgTable("document_history", {
  ...historyNodeColumns(),
  fileId: uuid("file_id"),
  aiDocumentTypeId: uuid("ai_suggested_required_document_type_id"),
  humanDocumentTypeId: uuid("human_required_document_type_id"),
  contentExtractionId: uuid("content_extraction_id"),
  documentName: varchar("document_name").notNull(),
  reasoning: text("reasoning"),
  confidence: doublePrecision("confidence"),
});
export const projectTemplateVersions = pgTable("project_template_version", {
  ...currentNodeColumns(),
  version: integer("version").notNull(),
  projectTypeId: uuid("project_type_id"),
});
export const projectTemplateVersionHistory = pgTable("project_template_version_history", {
  ...historyNodeColumns(),
  version: integer("version").notNull(),
  projectTypeId: uuid("project_type_id"),
});
export const tocNotes = pgTable("table_of_content_notes", {
  ...currentNodeColumns(),
  content: text("content").notNull(),
  isResolved: boolean("is_resolved").notNull(),
});
export const tocNoteHistory = pgTable("table_of_content_notes_history", {
  ...historyNodeColumns(),
  content: text("content").notNull(),
  isResolved: boolean("is_resolved").notNull(),
});
export const tocStatuses = pgTable("toc_job_status", {
  ...currentNodeColumns(),
  status: varchar("status").notNull(),
});
export const tocStatusHistory = pgTable("toc_job_status_history", {
  ...historyNodeColumns(),
  status: varchar("status").notNull(),
});

export const templateCategories = pgTable("template_category", {
  id: uuid("id").notNull(),
  name: varchar("name").notNull(),
  projectTypeId: uuid("project_type_id"),
  deleted: boolean("deleted").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});
export const templateCategoryHistory = pgTable("template_category_history", {
  id: uuid("id").notNull(),
  name: varchar("name").notNull(),
  projectTypeId: uuid("project_type_id"),
  deleted: boolean("deleted").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});
export const templateDocumentTypes = pgTable("template_document_type", {
  id: uuid("id").notNull(),
  templateCategoryId: uuid("template_category_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  expectedCount: integer("expected_count"),
  deleted: boolean("deleted").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});
export const templateDocumentTypeHistory = pgTable("template_document_type_history", {
  id: uuid("id").notNull(),
  templateCategoryId: uuid("template_category_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  expectedCount: integer("expected_count"),
  deleted: boolean("deleted").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});
export const mutationSchema = {
  auditLogs,
  coreProjects,
  coreProjectTypes,
  coreProjectVersionLocks,
  categories,
  categoryHistory,
  documents,
  documentHistory,
  documentTypes,
  documentTypeHistory,
  projectTemplateVersions,
  projectTemplateVersionHistory,
  templateCategories,
  templateCategoryHistory,
  templateDocumentTypes,
  templateDocumentTypeHistory,
  tocNotes,
  tocNoteHistory,
  tocStatuses,
  tocStatusHistory,
};

export type MutationDatabase = PostgresRuntime<typeof mutationSchema>;

const CORE_TEST_USER_ID = "82000000-0000-4000-8000-000000000099";

export async function seedCoreProject(
  database: MutationDatabase,
  projectId: string,
  projectTypeId?: string,
): Promise<void> {
  await database.query(async (query) => {
    if (projectTypeId !== undefined) {
      await query
        .insert(coreProjectTypes)
        .values({ id: projectTypeId, name: `Formal test ${projectTypeId}` })
        .onConflictDoNothing();
    }
    await query.insert(coreProjects).values({
      id: projectId,
      projectVersion: 1,
      name: `Formal test ${projectId}`,
      projectTypeId,
      createdById: CORE_TEST_USER_ID,
      rootProjectId: projectId,
    });
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

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.FCS_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error(
      "FCS_MUTATION_DATABASE_URL must name the prepared Formal Completeness database",
    );
  }
  return createDatabase(url);
}

export function createSeedDatabase(): MutationDatabase {
  const url = process.env.FCS_SEED_DATABASE_URL;
  if (url === undefined) {
    throw new Error(
      "FCS_SEED_DATABASE_URL must name the supervised Formal Completeness seed database",
    );
  }
  return createDatabase(url);
}

const createDatabase = (url: string): MutationDatabase =>
  createPostgresRuntime({
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

const byProject = <T extends { projectId: string; projectVersion: number | null; id: string }>(
  rows: T[],
): T[] =>
  rows.sort(
    (left, right) =>
      (left.projectVersion ?? 0) - (right.projectVersion ?? 0) || left.id.localeCompare(right.id),
  );

export async function readProjectState(database: MutationDatabase, projectId: string) {
  return database.query(async (query) => {
    const categoryRows = await query
      .select()
      .from(categories)
      .where(eq(categories.projectId, projectId));
    const categoryHistoryRows = await query
      .select()
      .from(categoryHistory)
      .where(eq(categoryHistory.projectId, projectId));
    const documentTypeRows = await query
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.projectId, projectId));
    const documentTypeHistoryRows = await query
      .select()
      .from(documentTypeHistory)
      .where(eq(documentTypeHistory.projectId, projectId));
    const documentRows = await query
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId));
    const documentHistoryRows = await query
      .select()
      .from(documentHistory)
      .where(eq(documentHistory.projectId, projectId));
    const projectTemplateRows = await query
      .select()
      .from(projectTemplateVersions)
      .where(eq(projectTemplateVersions.projectId, projectId));
    const projectTemplateHistoryRows = await query
      .select()
      .from(projectTemplateVersionHistory)
      .where(eq(projectTemplateVersionHistory.projectId, projectId));
    const tocNoteRows = await query
      .select()
      .from(tocNotes)
      .where(eq(tocNotes.projectId, projectId));
    const tocNoteHistoryRows = await query
      .select()
      .from(tocNoteHistory)
      .where(eq(tocNoteHistory.projectId, projectId));
    const tocStatusRows = await query
      .select()
      .from(tocStatuses)
      .where(eq(tocStatuses.projectId, projectId));
    const tocStatusHistoryRows = await query
      .select()
      .from(tocStatusHistory)
      .where(eq(tocStatusHistory.projectId, projectId));
    const auditRows = await query
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.projectId, projectId))
      .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));
    return {
      categories: byProject(categoryRows),
      categoryHistory: byProject(categoryHistoryRows),
      documentTypes: byProject(documentTypeRows),
      documentTypeHistory: byProject(documentTypeHistoryRows),
      documents: byProject(documentRows),
      documentHistory: byProject(documentHistoryRows),
      projectTemplateVersions: byProject(projectTemplateRows),
      projectTemplateVersionHistory: byProject(projectTemplateHistoryRows),
      tocNotes: byProject(tocNoteRows),
      tocNoteHistory: byProject(tocNoteHistoryRows),
      tocStatuses: byProject(tocStatusRows),
      tocStatusHistory: byProject(tocStatusHistoryRows),
      audit: auditRows,
    };
  });
}

export async function readTemplateState(database: MutationDatabase, projectTypeId: string) {
  return database.query(async (query) => {
    const categoryRows = await query
      .select()
      .from(templateCategories)
      .where(eq(templateCategories.projectTypeId, projectTypeId))
      .orderBy(asc(templateCategories.name), asc(templateCategories.id));
    const categoryHistoryRows = await query
      .select()
      .from(templateCategoryHistory)
      .where(eq(templateCategoryHistory.projectTypeId, projectTypeId))
      .orderBy(asc(templateCategoryHistory.name), asc(templateCategoryHistory.id));
    const categoryIds = [...new Set([...categoryRows, ...categoryHistoryRows].map(({ id }) => id))];
    const [documentTypeRows, documentTypeHistoryRows] =
      categoryIds.length === 0
        ? [[], []]
        : [
            await query
              .select()
              .from(templateDocumentTypes)
              .where(inArray(templateDocumentTypes.templateCategoryId, categoryIds))
              .orderBy(asc(templateDocumentTypes.name), asc(templateDocumentTypes.id)),
            await query
              .select()
              .from(templateDocumentTypeHistory)
              .where(inArray(templateDocumentTypeHistory.templateCategoryId, categoryIds))
              .orderBy(asc(templateDocumentTypeHistory.name), asc(templateDocumentTypeHistory.id)),
          ];
    return {
      categories: categoryRows,
      categoryHistory: categoryHistoryRows,
      documentTypes: documentTypeRows,
      documentTypeHistory: documentTypeHistoryRows,
    };
  });
}

export async function countProjectVersionRows(
  database: MutationDatabase,
  projectId: string,
  projectVersion: number,
) {
  return database.query(async (query) => {
    const categoryCount = await query.$count(
      categories,
      and(eq(categories.projectId, projectId), eq(categories.projectVersion, projectVersion)),
    );
    const documentTypeCount = await query.$count(
      documentTypes,
      and(eq(documentTypes.projectId, projectId), eq(documentTypes.projectVersion, projectVersion)),
    );
    const documentCount = await query.$count(
      documents,
      and(eq(documents.projectId, projectId), eq(documents.projectVersion, projectVersion)),
    );
    const templateVersionCount = await query.$count(
      projectTemplateVersions,
      and(
        eq(projectTemplateVersions.projectId, projectId),
        eq(projectTemplateVersions.projectVersion, projectVersion),
      ),
    );
    const noteCount = await query.$count(
      tocNotes,
      and(eq(tocNotes.projectId, projectId), eq(tocNotes.projectVersion, projectVersion)),
    );
    const statusCount = await query.$count(
      tocStatuses,
      and(eq(tocStatuses.projectId, projectId), eq(tocStatuses.projectVersion, projectVersion)),
    );
    return {
      categories: categoryCount,
      documentTypes: documentTypeCount,
      documents: documentCount,
      projectTemplateVersions: templateVersionCount,
      tocNotes: noteCount,
      tocStatuses: statusCount,
    };
  });
}

export async function cleanupMutationScenario(
  database: MutationDatabase,
  options: { projectIds?: readonly string[]; projectTypeIds?: readonly string[] },
): Promise<void> {
  const projectIds = [...(options.projectIds ?? [])];
  const projectTypeIds = [...(options.projectTypeIds ?? [])];
  await database.transact(async () => {
    await database.query(async (query) => {
      if (projectIds.length > 0) {
        await query.delete(documents).where(inArray(documents.projectId, projectIds));
        await query.delete(documentTypes).where(inArray(documentTypes.projectId, projectIds));
        await query.delete(categories).where(inArray(categories.projectId, projectIds));
        await query.delete(tocNotes).where(inArray(tocNotes.projectId, projectIds));
        await query.delete(tocStatuses).where(inArray(tocStatuses.projectId, projectIds));
        await query
          .delete(projectTemplateVersions)
          .where(inArray(projectTemplateVersions.projectId, projectIds));
        await query.delete(documentHistory).where(inArray(documentHistory.projectId, projectIds));
        await query
          .delete(documentTypeHistory)
          .where(inArray(documentTypeHistory.projectId, projectIds));
        await query.delete(categoryHistory).where(inArray(categoryHistory.projectId, projectIds));
        await query.delete(tocNoteHistory).where(inArray(tocNoteHistory.projectId, projectIds));
        await query.delete(tocStatusHistory).where(inArray(tocStatusHistory.projectId, projectIds));
        await query
          .delete(projectTemplateVersionHistory)
          .where(inArray(projectTemplateVersionHistory.projectId, projectIds));
        await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
        await query
          .delete(coreProjectVersionLocks)
          .where(inArray(coreProjectVersionLocks.projectId, projectIds));
        await query.delete(coreProjects).where(inArray(coreProjects.id, projectIds));
      }
      if (projectTypeIds.length > 0) {
        const currentCategories = await query
          .select({ id: templateCategories.id })
          .from(templateCategories)
          .where(inArray(templateCategories.projectTypeId, projectTypeIds));
        const historicalCategories = await query
          .select({ id: templateCategoryHistory.id })
          .from(templateCategoryHistory)
          .where(inArray(templateCategoryHistory.projectTypeId, projectTypeIds));
        const categoryIds = [
          ...new Set([...currentCategories, ...historicalCategories].map(({ id }) => id)),
        ];
        if (categoryIds.length > 0) {
          await query
            .delete(templateDocumentTypes)
            .where(inArray(templateDocumentTypes.templateCategoryId, categoryIds));
        }
        await query
          .delete(templateCategories)
          .where(inArray(templateCategories.projectTypeId, projectTypeIds));
        if (categoryIds.length > 0) {
          await query
            .delete(templateDocumentTypeHistory)
            .where(inArray(templateDocumentTypeHistory.templateCategoryId, categoryIds));
        }
        await query
          .delete(templateCategoryHistory)
          .where(inArray(templateCategoryHistory.projectTypeId, projectTypeIds));
        await query.delete(coreProjectTypes).where(inArray(coreProjectTypes.id, projectTypeIds));
      }
    });
  });
}

export async function assertScenarioAbsent(
  database: MutationDatabase,
  options: { projectIds?: readonly string[]; projectTypeIds?: readonly string[] },
): Promise<void> {
  for (const projectId of options.projectIds ?? []) {
    const state = await readProjectState(database, projectId);
    if (Object.values(state).some((rows) => rows.length !== 0)) {
      throw new Error(`Formal Completeness mutation project ${projectId} retained rows`);
    }
    const coreRows = await database.query(async (query) =>
      query
        .select({ id: coreProjects.id })
        .from(coreProjects)
        .where(eq(coreProjects.id, projectId)),
    );
    if (coreRows.length !== 0) {
      throw new Error(`Formal Completeness mutation project ${projectId} retained core rows`);
    }
  }
  for (const projectTypeId of options.projectTypeIds ?? []) {
    const state = await readTemplateState(database, projectTypeId);
    if (Object.values(state).some((rows) => rows.length !== 0)) {
      throw new Error(`Formal Completeness mutation project type ${projectTypeId} retained rows`);
    }
  }
}
