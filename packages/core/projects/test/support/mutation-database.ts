import { createPostgresRuntime, type PostgresRuntime } from "@spark-workflow/postgres-runtime";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  integer,
  jsonb,
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

const nodeColumns = () => ({
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
  isDeleted: boolean("is_deleted").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  updateType: varchar("update_type"),
  isOutdated: boolean("is_outdated"),
});

const applicantFields = () => ({
  salutation: varchar("salutation"),
  company: varchar("company"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  street: varchar("street"),
  houseNumber: varchar("house_number"),
  addressSupplement: varchar("address_supplement"),
  plz: varchar("plz"),
  location: varchar("location"),
  country: varchar("country"),
  email: varchar("email"),
  phone: varchar("phone"),
  fax: varchar("fax"),
});

export const applicants = pgTable("applicant", {
  ...nodeColumns(),
  ...applicantFields(),
});
export const applicantHistory = pgTable("applicant_history", {
  ...historyNodeColumns(),
  ...applicantFields(),
});

const deadlineFields = () => ({
  startAt: date("start_at", { mode: "string" }),
  endAt: date("end_at", { mode: "string" }),
  deadlineType: varchar("deadline_type"),
  legalBasis: varchar("legal_basis"),
});
export const deadlines = pgTable("deadline", { ...nodeColumns(), ...deadlineFields() });
export const deadlineHistory = pgTable("deadline_history", {
  ...historyNodeColumns(),
  ...deadlineFields(),
});

const projectFields = () => ({
  name: varchar("name"),
  projectTypeId: uuid("project_type_id"),
  createdById: uuid("created_by_id"),
  entryDate: date("entry_date", { mode: "string" }),
  internalProjectNumber: varchar("internal_project_number"),
  statusId: uuid("status_id"),
  currentProcessStepId: uuid("current_process_step_id"),
  applicantId: uuid("applicant_id"),
  rootProjectId: uuid("project_id"),
  state: varchar("state", { length: 2 }),
  imported: boolean("imported"),
  originalCreatedAt: timestamp("original_created_at", { mode: "date", withTimezone: true }),
});
export const projects = pgTable("project", {
  id: uuid("id").notNull(),
  projectVersion: integer("project_version").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
  isDeleted: boolean("is_deleted").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  updateType: varchar("update_type"),
  isOutdated: boolean("is_outdated").notNull(),
  ...projectFields(),
});
export const projectHistory = pgTable("project_history", {
  id: uuid("id").notNull(),
  projectVersion: integer("project_version"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
  isDeleted: boolean("is_deleted").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  updateType: varchar("update_type"),
  isOutdated: boolean("is_outdated"),
  ...projectFields(),
});

export const projectStatuses = pgTable("project_status", {
  id: uuid("id").notNull(),
  name: varchar("name"),
  internalName: varchar("internal_name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});
export const projectStatusHistory = pgTable("project_status_history", {
  id: uuid("id").notNull(),
  name: varchar("name"),
  internalName: varchar("internal_name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const projectTypes = pgTable("project_type", {
  id: uuid("id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});
export const projectTypeHistory = pgTable("project_type_history", {
  id: uuid("id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const processSteps = pgTable("process_step", {
  id: uuid("id").notNull(),
  processStepIndex: integer("process_step_index"),
  projectTypeId: uuid("project_type_id"),
  name: varchar("name"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

const topicFields = () => ({
  name: varchar("name").notNull(),
  description: varchar("description"),
  parentTopicId: uuid("parent_topic_id"),
  mvpAssignee: uuid("mvp_assignee"),
  rpbAssignee: uuid("rpb_assignee"),
  mvpAssignees: uuid("mvp_assignees").array().notNull(),
  rpbAssignees: uuid("rpb_assignees").array().notNull(),
  showInMvp: boolean("show_in_mvp").notNull(),
  showInEwm: boolean("show_in_ewm").notNull(),
  showInBeschluss: boolean("show_in_beschluss").notNull(),
});
export const topics = pgTable("topic", { ...nodeColumns(), ...topicFields() });
export const topicHistory = pgTable("topic_history", {
  ...historyNodeColumns(),
  ...topicFields(),
});

const subtopicFields = () => ({
  topicId: uuid("topic_id").notNull(),
  name: varchar("name").notNull(),
  description: varchar("description"),
  showInMvp: boolean("show_in_mvp").notNull(),
  showInEwm: boolean("show_in_ewm").notNull(),
  showInBeschluss: boolean("show_in_beschluss").notNull(),
});
export const subtopics = pgTable("subtopic", { ...nodeColumns(), ...subtopicFields() });
export const subtopicHistory = pgTable("subtopic_history", {
  ...historyNodeColumns(),
  ...subtopicFields(),
});

const topicNormFields = () => ({
  topicId: uuid("topic_id"),
  jurabk: varchar("jurabk").notNull(),
  paragraphNr: varchar("paragraph_nr"),
  satz: varchar("satz"),
  absatz: varchar("absatz"),
  nummer: varchar("nummer"),
  type: varchar("type", { length: 9 }).notNull(),
  mvpStatus: varchar("mvp_status", { length: 32 }).notNull(),
  satzStatuses: jsonb("satz_statuses").$type<Record<string, string>>().notNull(),
});
export const topicNorms = pgTable("topic_norm", { ...nodeColumns(), ...topicNormFields() });
export const topicNormHistory = pgTable("topic_norm_history", {
  ...historyNodeColumns(),
  ...topicNormFields(),
});

export const projectVersionLocks = pgTable("project_version_lock", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  sourceVersion: integer("source_version").notNull(),
  targetVersion: integer("target_version").notNull(),
  zipFileId: uuid("zip_file_id"),
  lockToken: varchar("lock_token").notNull(),
  status: varchar("status", { length: 8 }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const mutationSchema = {
  applicantHistory,
  applicants,
  auditLogs,
  deadlineHistory,
  deadlines,
  processSteps,
  projectHistory,
  projectStatusHistory,
  projectStatuses,
  projectTypeHistory,
  projectTypes,
  projectVersionLocks,
  projects,
  subtopicHistory,
  subtopics,
  topicHistory,
  topicNormHistory,
  topicNorms,
  topics,
};

export type MutationDatabase = PostgresRuntime<typeof mutationSchema>;

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

export function createMutationDatabase(): MutationDatabase {
  const url = process.env.PLS_MUTATION_DATABASE_URL;
  if (url === undefined) {
    throw new Error("PLS_MUTATION_DATABASE_URL must name the prepared Project Logic database");
  }
  return createDatabase(url);
}

export function createSeedDatabase(): MutationDatabase {
  const url = process.env.PLS_SEED_DATABASE_URL;
  if (url === undefined) {
    throw new Error("PLS_SEED_DATABASE_URL must name the supervised Project Logic seed database");
  }
  return createDatabase(url);
}

export async function classifyProjectEntryDate(
  database: MutationDatabase,
  projectId: string,
) {
  const rows = await database.query(async (query) =>
    query
      .select({
        negativeInfinity: eq(projects.entryDate, "-infinity"),
        positiveInfinity: eq(projects.entryDate, "infinity"),
        null: isNull(projects.entryDate),
      })
      .from(projects)
      .where(eq(projects.id, projectId)),
  );
  const [row] = rows;
  if (row === undefined || rows.length !== 1) {
    throw new Error(`Expected one test-owned Project row for ${projectId}, found ${rows.length}`);
  }
  return row;
}

export async function insertActiveVersionLock(
  database: MutationDatabase,
  input: {
    projectId: string;
    sourceVersion: number;
    targetVersion: number;
    lockToken: string;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await database.query(async (query) =>
    query.insert(projectVersionLocks).values({
      id,
      projectId: input.projectId,
      sourceVersion: input.sourceVersion,
      targetVersion: input.targetVersion,
      zipFileId: null,
      lockToken: input.lockToken,
      status: "ACTIVE",
      error: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return id;
}

export async function copyProjectRootVersion(
  database: MutationDatabase,
  input: { projectId: string; sourceVersion: number; targetVersion: number },
): Promise<void> {
  await database.query(async (query) => {
    const [source] = await query
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.projectVersion, input.sourceVersion)));
    if (source === undefined) {
      throw new Error(
        `Project ${input.projectId} has no root at source version ${input.sourceVersion}`,
      );
    }

    const now = new Date();
    await query.insert(projects).values({
      ...source,
      projectVersion: input.targetVersion,
      createdAt: now,
      updatedAt: now,
    });
  });
}

const byVersionAndId = <T extends { projectVersion: number | null; id: string }>(rows: T[]) =>
  rows.toSorted(
    (left, right) =>
      (left.projectVersion ?? 0) - (right.projectVersion ?? 0) || left.id.localeCompare(right.id),
  );

export async function readProjectState(database: MutationDatabase, projectId: string) {
  return database.query(async (query) => {
  const projectRows = await query
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  const applicantRows = await query
    .select()
    .from(applicants)
    .where(eq(applicants.projectId, projectId));
  const deadlineRows = await query
    .select()
    .from(deadlines)
    .where(eq(deadlines.projectId, projectId));
  const topicRows = await query
    .select()
    .from(topics)
    .where(eq(topics.projectId, projectId));
  const subtopicRows = await query
    .select()
    .from(subtopics)
    .where(eq(subtopics.projectId, projectId));
  const topicNormRows = await query
    .select()
    .from(topicNorms)
    .where(eq(topicNorms.projectId, projectId));
  const lockRows = await query
    .select()
    .from(projectVersionLocks)
    .where(eq(projectVersionLocks.projectId, projectId));
  const applicantHistoryRows = await query
    .select()
    .from(applicantHistory)
    .where(eq(applicantHistory.projectId, projectId));
  const deadlineHistoryRows = await query
    .select()
    .from(deadlineHistory)
    .where(eq(deadlineHistory.projectId, projectId));
  const projectHistoryRows = await query
    .select()
    .from(projectHistory)
    .where(eq(projectHistory.id, projectId));
  const topicHistoryRows = await query
    .select()
    .from(topicHistory)
    .where(eq(topicHistory.projectId, projectId));
  const subtopicHistoryRows = await query
    .select()
    .from(subtopicHistory)
    .where(eq(subtopicHistory.projectId, projectId));
  const topicNormHistoryRows = await query
    .select()
    .from(topicNormHistory)
    .where(eq(topicNormHistory.projectId, projectId));
  const auditRows = await query
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.projectId, projectId))
    .orderBy(asc(auditLogs.timestamp), asc(auditLogs.id));

    return {
    applicants: byVersionAndId(applicantRows),
    applicantHistory: byVersionAndId(applicantHistoryRows),
    audit: auditRows,
    deadlines: byVersionAndId(deadlineRows),
    deadlineHistory: byVersionAndId(deadlineHistoryRows),
    locks: lockRows.toSorted((left, right) => left.id.localeCompare(right.id)),
    projects: byVersionAndId(projectRows),
    projectHistory: byVersionAndId(projectHistoryRows),
    subtopics: byVersionAndId(subtopicRows),
    subtopicHistory: byVersionAndId(subtopicHistoryRows),
    topicNorms: byVersionAndId(topicNormRows),
    topicNormHistory: byVersionAndId(topicNormHistoryRows),
    topics: byVersionAndId(topicRows),
    topicHistory: byVersionAndId(topicHistoryRows),
    };
  });
}

export async function readProjectTypeState(database: MutationDatabase, projectTypeId: string) {
  return database.query(async (query) => {
  const current = await query
    .select()
    .from(projectTypes)
    .where(eq(projectTypes.id, projectTypeId));
  const history = await query
    .select()
    .from(projectTypeHistory)
    .where(eq(projectTypeHistory.id, projectTypeId));
  const steps = await query
    .select()
    .from(processSteps)
    .where(eq(processSteps.projectTypeId, projectTypeId));
    return { current, history, steps };
  });
}

export async function readSeedState(
  database: MutationDatabase,
  statusIds: string[],
  projectTypeId: string,
) {
  return database.query(async (query) => {
  const statuses = await query
    .select()
    .from(projectStatuses)
    .where(inArray(projectStatuses.id, statusIds));
  const statusHistory = await query
    .select()
    .from(projectStatusHistory)
    .where(inArray(projectStatusHistory.id, statusIds));
  const types = await query
    .select()
    .from(projectTypes)
    .where(eq(projectTypes.id, projectTypeId));
  const typeHistory = await query
    .select()
    .from(projectTypeHistory)
    .where(eq(projectTypeHistory.id, projectTypeId));
    return {
    statuses: statuses.toSorted((left, right) => left.id.localeCompare(right.id)),
    statusHistory,
    types,
    typeHistory,
    };
  });
}

export async function cleanupMutationScenario(
  database: MutationDatabase,
  input: { projectIds?: string[]; projectTypeIds?: string[] },
) {
  const projectIds = [...new Set(input.projectIds ?? [])];
  const projectTypeIds = [...new Set(input.projectTypeIds ?? [])];
  await database.transact(async () => {
    await database.query(async (query) => {
    if (projectIds.length > 0) {
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
      await query.delete(topicNorms).where(inArray(topicNorms.projectId, projectIds));
      await query.delete(subtopics).where(inArray(subtopics.projectId, projectIds));
      await query.delete(deadlines).where(inArray(deadlines.projectId, projectIds));
      await query.delete(topics).where(inArray(topics.projectId, projectIds));
      await query
        .delete(projectVersionLocks)
        .where(inArray(projectVersionLocks.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
      await query.delete(applicants).where(inArray(applicants.projectId, projectIds));

      await query
        .delete(topicNormHistory)
        .where(inArray(topicNormHistory.projectId, projectIds));
      await query
        .delete(subtopicHistory)
        .where(inArray(subtopicHistory.projectId, projectIds));
      await query
        .delete(deadlineHistory)
        .where(inArray(deadlineHistory.projectId, projectIds));
      await query.delete(topicHistory).where(inArray(topicHistory.projectId, projectIds));
      await query.delete(projectHistory).where(inArray(projectHistory.id, projectIds));
      await query
        .delete(applicantHistory)
        .where(inArray(applicantHistory.projectId, projectIds));
    }
    if (projectTypeIds.length > 0) {
      await query.delete(projectTypes).where(inArray(projectTypes.id, projectTypeIds));
      await query
        .delete(projectTypeHistory)
        .where(inArray(projectTypeHistory.id, projectTypeIds));
    }
    });
  });
}

export async function cleanupAuditEntries(
  database: MutationDatabase,
  auditIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(auditIds)];
  if (ids.length > 0) {
    await database.query(async (query) =>
      query.delete(auditLogs).where(inArray(auditLogs.id, ids)),
    );
  }
}

export async function assertMutationScenarioAbsent(
  database: MutationDatabase,
  input: { projectIds?: string[]; projectTypeIds?: string[] },
) {
  for (const projectId of input.projectIds ?? []) {
    const state = await readProjectState(database, projectId);
    expectEmptyState(state, `project ${projectId}`);
  }
  for (const projectTypeId of input.projectTypeIds ?? []) {
    const state = await readProjectTypeState(database, projectTypeId);
    expectEmptyState(state, `project type ${projectTypeId}`);
  }
}

const expectEmptyState = (state: Record<string, unknown[]>, label: string) => {
  for (const [name, rows] of Object.entries(state)) {
    if (rows.length !== 0) throw new Error(`${label} retained ${rows.length} ${name} row(s)`);
  }
};
