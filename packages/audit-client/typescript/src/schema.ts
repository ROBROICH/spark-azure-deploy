import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    timestamp: timestamp("timestamp", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    projectId: uuid("project_id").notNull(),
    entityId: uuid("entity_id"),
    entityType: varchar("entity_type").notNull(),
    changeType: varchar("change_type").notNull(),
    actionType: varchar("action_type"),
    actorUserId: uuid("actor_user_id"),
    triggeredByUserId: uuid("triggered_by_user_id"),
    workflowRunId: varchar("workflow_run_id"),
    workflowType: varchar("workflow_type"),
    requestStartTime: timestamp("request_start_time", {
      mode: "date",
      withTimezone: true,
    }),
    requestId: varchar("request_id"),
  },
  (table) => [
    index("ix_audit_log_project_timestamp").on(
      table.projectId,
      table.timestamp.desc().nullsFirst(),
    ),
  ],
);
