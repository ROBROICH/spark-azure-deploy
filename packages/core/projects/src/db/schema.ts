import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { updateType } from "../../../src/update-type.ts";
import { usecaseDocuments, usecaseSchema } from "../../../usecases/src/schema.ts";

export { usecaseDocuments };

const timestampRange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});
const currentTimestamp = sql`CURRENT_TIMESTAMP`;
const currentPeriod = sql`tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone)`;

export { updateType };

export const projectTypes = pgTable(
  "project_type",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
  },
  (table) => [unique("uq_project_type_name").on(table.name)],
);

export const projectStatuses = pgTable("project_status", {
  id: uuid("id").primaryKey(),
  name: varchar("name"),
  internalName: varchar("internal_name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .default(currentTimestamp)
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .default(currentTimestamp)
    .notNull(),
  sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
});

export const processSteps = pgTable(
  "process_step",
  {
    id: uuid("id").primaryKey(),
    processStepIndex: integer("process_step_index"),
    projectTypeId: uuid("project_type_id"),
    name: varchar("name"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectTypeId],
      foreignColumns: [projectTypes.id],
      name: "process_step_project_type_id_fkey",
    }),
  ],
);

export const applicants = pgTable(
  "applicant",
  {
    id: uuid("id").notNull(),
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
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "applicant_pkey" }),
    index("ix_applicant_project_id").on(table.projectId),
    index("ix_applicant_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
  ],
);

export const projects = pgTable(
  "project",
  {
    id: uuid("id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    name: varchar("name"),
    projectTypeId: uuid("project_type_id"),
    createdById: uuid("created_by_id").notNull(),
    entryDate: date("entry_date", { mode: "string" }),
    internalProjectNumber: varchar("internal_project_number"),
    statusId: uuid("status_id"),
    currentProcessStepId: uuid("current_process_step_id"),
    applicantId: uuid("applicant_id"),
    rootProjectId: uuid("project_id"),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    state: varchar("state", { length: 2 }),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
    imported: boolean("imported").default(false).notNull(),
    originalCreatedAt: timestamp("original_created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "project_pkey" }),
    uniqueIndex("project_internal_project_number_key")
      .on(table.internalProjectNumber, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    foreignKey({
      columns: [table.applicantId, table.projectVersion],
      foreignColumns: [applicants.id, applicants.projectVersion],
      name: "fk_project_applicant_id",
    }),
    foreignKey({
      columns: [table.currentProcessStepId],
      foreignColumns: [processSteps.id],
      name: "project_current_process_step_id_fkey",
    }),
    foreignKey({
      columns: [table.projectTypeId],
      foreignColumns: [projectTypes.id],
      name: "project_project_type_id_fkey",
    }),
    foreignKey({
      columns: [table.statusId],
      foreignColumns: [projectStatuses.id],
      name: "project_status_id_fkey",
    }),
    check(
      "germanstate",
      sql`${table.state}::text = ANY (ARRAY['BY', 'BW', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']::text[])`,
    ),
  ],
);

export const deadlines = pgTable(
  "deadline",
  {
    id: uuid("id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    projectId: uuid("project_id").notNull(),
    startAt: date("start_at", { mode: "string" }),
    endAt: date("end_at", { mode: "string" }),
    deadlineType: varchar("deadline_type"),
    legalBasis: varchar("legal_basis"),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "deadline_pkey" }),
    check("ck_deadline_date_range", sql`${table.startAt} <= ${table.endAt}`),
    index("ix_deadline_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    foreignKey({
      columns: [table.projectId, table.projectVersion],
      foreignColumns: [projects.id, projects.projectVersion],
      name: "deadline_project_id_fkey",
    }),
  ],
);

const topicVisibility = {
  showInMvp: boolean("show_in_mvp").notNull(),
  showInEwm: boolean("show_in_ewm").notNull(),
  showInBeschluss: boolean("show_in_beschluss").notNull(),
};

/** Lockstep with AOS `TopicSchema` and `EwmTopicNodeSchema` in agent_orchestration_service. */
export const topics = pgTable(
  "topic",
  {
    id: uuid("id").notNull(),
    name: varchar("name").notNull(),
    description: varchar("description"),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    parentTopicId: uuid("parent_topic_id"),
    projectId: uuid("project_id").notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    mvpAssignee: uuid("mvp_assignee"),
    rpbAssignee: uuid("rpb_assignee"),
    ...topicVisibility,
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    mvpAssignees: uuid("mvp_assignees").array().default([]).notNull(),
    rpbAssignees: uuid("rpb_assignees").array().default([]).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "topic_pkey" }),
    unique("uq_topic_project_id_version").on(table.projectId, table.id, table.projectVersion),
    index("ix_topic_parent_topic_id").on(table.parentTopicId),
    index("ix_topic_project_id").on(table.projectId),
    index("ix_topic_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    uniqueIndex("uq_topic_project_parent_name_active")
      .on(table.projectId, table.projectVersion, table.parentTopicId, table.name)
      .where(sql`${table.isDeleted} IS FALSE`),
    uniqueIndex("uq_topic_project_root_name_active")
      .on(table.projectId, table.projectVersion, table.name)
      .where(sql`${table.isDeleted} IS FALSE AND ${table.parentTopicId} IS NULL`),
    foreignKey({
      columns: [table.projectId, table.parentTopicId, table.projectVersion],
      foreignColumns: [table.projectId, table.id, table.projectVersion],
      name: "topic_parent_project_version_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.projectVersion],
      foreignColumns: [projects.id, projects.projectVersion],
      name: "topic_project_id_fkey",
    }).onDelete("cascade"),
    check(
      "updatetype",
      sql`${table.updateType}::text = ANY (ARRAY['AUTOMATED', 'MANUAL']::text[])`,
    ),
  ],
);

/** Lockstep with AOS `EwmTopicNodeSchema` in assessment-contracts.ts. */
export const subtopics = pgTable(
  "subtopic",
  {
    projectId: uuid("project_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    id: uuid("id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    name: varchar("name").notNull(),
    ...topicVisibility,
    description: varchar("description"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "subtopic_pkey" }),
    index("ix_subtopic_project_id").on(table.projectId),
    index("ix_subtopic_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    index("ix_subtopic_topic_id").on(table.topicId),
    uniqueIndex("uq_subtopic_topic_name_active")
      .on(table.topicId, table.projectVersion, table.name)
      .where(sql`${table.isDeleted} IS FALSE`),
    foreignKey({
      columns: [table.projectId, table.projectVersion],
      foreignColumns: [projects.id, projects.projectVersion],
      name: "fk_subtopic_project_id_project",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.topicId, table.projectVersion],
      foreignColumns: [topics.projectId, topics.id, topics.projectVersion],
      name: "subtopic_topic_project_version_fkey",
    }).onDelete("cascade"),
  ],
);

/** Lockstep with AOS `TopicNormNodeSchema` in agent_orchestration_service schemas.ts. */
export const topicNorms = pgTable(
  "topic_norm",
  {
    topicId: uuid("topic_id").notNull(),
    projectId: uuid("project_id").notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    id: uuid("id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    jurabk: varchar("jurabk").notNull(),
    paragraphNr: varchar("paragraph_nr"),
    satz: varchar("satz"),
    absatz: varchar("absatz"),
    nummer: varchar("nummer"),
    type: varchar("type", { length: 9 }).default("PRUEFUNG").notNull(),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    mvpStatus: varchar("mvp_status", {
      length: 32,
      enum: ["unchecked", "checked", "needs_revision"],
    })
      .default("unchecked")
      .notNull(),
    satzStatuses: jsonb("satz_statuses")
      .$type<Record<string, "unchecked" | "checked" | "needs_revision">>()
      .default({})
      .notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "topic_norm_pkey" }),
    index("ix_topic_norm_project_id").on(table.projectId),
    index("ix_topic_norm_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    index("ix_topic_norm_topic_id").on(table.topicId),
    uniqueIndex("uq_topic_norm")
      .on(
        table.topicId,
        table.projectVersion,
        table.jurabk,
        table.paragraphNr,
        table.satz,
        table.absatz,
        table.nummer,
      )
      .where(sql`${table.isDeleted} IS FALSE`),
    uniqueIndex("uq_topic_norm_same_type_active")
      .on(
        table.topicId,
        table.projectVersion,
        table.jurabk,
        table.type,
        sql`(ARRAY[${table.paragraphNr}, ${table.satz}, ${table.absatz}, ${table.nummer}])`,
      )
      .where(sql`${table.isDeleted} IS FALSE`),
    foreignKey({
      columns: [table.projectId, table.projectVersion],
      foreignColumns: [projects.id, projects.projectVersion],
      name: "topic_norm_project_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.topicId, table.projectVersion],
      foreignColumns: [topics.projectId, topics.id, topics.projectVersion],
      name: "topic_norm_topic_project_version_fkey",
    }).onDelete("cascade"),
    check(
      "ck_topic_norm_mvp_status",
      sql`${table.mvpStatus}::text = ANY (ARRAY['unchecked', 'checked', 'needs_revision']::text[])`,
    ),
    check("topicnormtype", sql`${table.type}::text = ANY (ARRAY['PRUEFUNG', 'VERFAHREN']::text[])`),
    check(
      "updatetype",
      sql`${table.updateType}::text = ANY (ARRAY['AUTOMATED', 'MANUAL']::text[])`,
    ),
  ],
);

export const projectVersionLocks = pgTable(
  "project_version_lock",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    targetVersion: integer("target_version").notNull(),
    zipFileId: uuid("zip_file_id"),
    lockToken: varchar("lock_token").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .default(currentTimestamp)
      .notNull(),
    status: varchar("status", { length: 8 }).default("ACTIVE").notNull(),
    error: varchar("error"),
  },
  (table) => [
    index("ix_project_version_lock_project_id").on(table.projectId),
    index("ix_project_version_lock_zip_file_id").on(table.zipFileId),
    uniqueIndex("uq_active_project_version_lock")
      .on(table.projectId)
      .where(sql`${table.status}::text = 'ACTIVE'::text`),
    unique("uq_project_version_lock_lock_token").on(table.lockToken),
    check(
      "projectversionlockstatus",
      sql`${table.status}::text = ANY (ARRAY['ACTIVE', 'RELEASED']::text[])`,
    ),
  ],
);

export const applicantHistory = pgTable(
  "applicant_history",
  {
    id: uuid("id").notNull(),
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
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("applicant_history_id_idx").on(table.id),
    index("applicant_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const deadlineHistory = pgTable(
  "deadline_history",
  {
    id: uuid("id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    projectId: uuid("project_id").notNull(),
    startAt: date("start_at", { mode: "string" }),
    endAt: date("end_at", { mode: "string" }),
    deadlineType: varchar("deadline_type"),
    legalBasis: varchar("legal_basis"),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("deadline_history_id_idx").on(table.id),
    index("deadline_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const processStepHistory = pgTable(
  "process_step_history",
  {
    id: uuid("id").notNull(),
    processStepIndex: integer("process_step_index"),
    projectTypeId: uuid("project_type_id"),
    name: varchar("name"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
  },
  (table) => [
    index("process_step_history_id_idx").on(table.id),
    index("process_step_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const projectHistory = pgTable(
  "project_history",
  {
    id: uuid("id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    name: varchar("name"),
    projectTypeId: uuid("project_type_id"),
    createdById: uuid("created_by_id"),
    entryDate: date("entry_date", { mode: "string" }),
    internalProjectNumber: varchar("internal_project_number"),
    statusId: uuid("status_id"),
    currentProcessStepId: uuid("current_process_step_id"),
    applicantId: uuid("applicant_id"),
    rootProjectId: uuid("project_id"),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
    state: varchar("state", { length: 2 }),
    imported: boolean("imported"),
    originalCreatedAt: timestamp("original_created_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    index("project_history_id_idx").on(table.id),
    index("project_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const projectStatusHistory = pgTable(
  "project_status_history",
  {
    id: uuid("id").notNull(),
    name: varchar("name"),
    internalName: varchar("internal_name").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
  },
  (table) => [
    index("project_status_history_id_idx").on(table.id),
    index("project_status_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const projectTypeHistory = pgTable(
  "project_type_history",
  {
    id: uuid("id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
  },
  (table) => [
    index("project_type_history_id_idx").on(table.id),
    index("project_type_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const subtopicHistory = pgTable(
  "subtopic_history",
  {
    projectId: uuid("project_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    id: uuid("id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    name: varchar("name").notNull(),
    showInMvp: boolean("show_in_mvp").notNull(),
    showInEwm: boolean("show_in_ewm").notNull(),
    showInBeschluss: boolean("show_in_beschluss").notNull(),
    description: varchar("description"),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("subtopic_history_id_idx").on(table.id),
    index("subtopic_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const topicHistory = pgTable(
  "topic_history",
  {
    id: uuid("id").notNull(),
    name: varchar("name").notNull(),
    description: varchar("description"),
    isDeleted: boolean("is_deleted").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    parentTopicId: uuid("parent_topic_id"),
    projectId: uuid("project_id").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    mvpAssignee: uuid("mvp_assignee"),
    rpbAssignee: uuid("rpb_assignee"),
    showInMvp: boolean("show_in_mvp").notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    showInEwm: boolean("show_in_ewm").notNull(),
    showInBeschluss: boolean("show_in_beschluss").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
    mvpAssignees: uuid("mvp_assignees").array().default([]).notNull(),
    rpbAssignees: uuid("rpb_assignees").array().default([]).notNull(),
  },
  (table) => [
    index("topic_history_id_idx").on(table.id),
    index("topic_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const topicNormHistory = pgTable(
  "topic_norm_history",
  {
    topicId: uuid("topic_id"),
    projectId: uuid("project_id").notNull(),
    updateType: updateType("update_type"),
    id: uuid("id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    jurabk: varchar("jurabk").notNull(),
    paragraphNr: varchar("paragraph_nr"),
    satz: varchar("satz"),
    absatz: varchar("absatz"),
    nummer: varchar("nummer"),
    type: varchar("type", { length: 9 }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    mvpStatus: varchar("mvp_status", {
      length: 32,
      enum: ["unchecked", "checked", "needs_revision"],
    })
      .default("unchecked")
      .notNull(),
    satzStatuses: jsonb("satz_statuses")
      .$type<Record<string, "unchecked" | "checked" | "needs_revision">>()
      .default({})
      .notNull(),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("topic_norm_history_id_idx").on(table.id),
    index("topic_norm_history_sys_period_idx").on(table.sysPeriod),
    check(
      "ck_topic_norm_history_mvp_status",
      sql`${table.mvpStatus}::text = ANY (ARRAY['unchecked', 'checked', 'needs_revision']::text[])`,
    ),
  ],
);

export const projectLogicNodeTables = { deadlines, subtopics, topicNorms, topics };

export const projectLogicSchema = {
  ...usecaseSchema,
  applicantHistory,
  applicants,
  deadlineHistory,
  processStepHistory,
  processSteps,
  projectHistory,
  projectStatusHistory,
  projectStatuses,
  projectTypeHistory,
  projectTypes,
  projectVersionLocks,
  projects,
  subtopicHistory,
  topicHistory,
  topicNormHistory,
  ...projectLogicNodeTables,
};

export type ProjectLogicSchema = typeof projectLogicSchema;
