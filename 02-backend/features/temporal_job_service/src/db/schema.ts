import type { WorkflowFailureBranch } from "@spark-temporal/contracts";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const workflowStatus = pgEnum("workflow_status", [
  "pending",
  "running",
  "failed",
  "completed",
  "terminated",
  "cancelled",
  "timed_out",
]);

export const workflowExecutions = pgTable(
  "workflow_execution",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: varchar("workflow_id").notNull(),
    runId: varchar("run_id").notNull(),
    workflowType: varchar("workflow_type").notNull(),
    projectId: uuid("project_id"),
    projectVersion: integer("project_version"),
    status: workflowStatus("status").notNull(),
    startTime: timestamp("start_time", { mode: "date", withTimezone: true }),
    endTime: timestamp("end_time", { mode: "date", withTimezone: true }),
    failureMessage: varchar("failure_message"),
    // Catalog code and failed branches the workflow put on its terminal failure; null otherwise.
    failureCode: varchar("failure_code"),
    failureBranches: jsonb("failure_branches").$type<WorkflowFailureBranch[]>(),
    historyS3Key: varchar("history_s3_key"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_workflow_execution_wf_run").on(table.workflowId, table.runId),
    index("ix_workflow_execution_active")
      .on(table.status)
      .where(sql`${table.status} IN ('pending'::workflow_status, 'running'::workflow_status)`),
    index("ix_workflow_execution_project_type").on(table.projectId, table.workflowType),
    index("ix_workflow_execution_end_time").on(table.endTime),
  ],
);

export const temporalJobDatabaseSchema = { workflowExecutions, workflowStatus };
