import { relations } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const fppRequests = pgTable(
  "fpp_request",
  {
    requestId: uuid("request_id").notNull(),
    internalProjectId: varchar("internal_project_id").notNull(),
    name: varchar("name").notNull(),
    xml: text("xml").notNull(),
    projectId: uuid("project_id"),
    status: varchar("status").notNull().default("RECEIVED"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "fpp_request_pkey", columns: [table.requestId] }),
    index("ix_fpp_request_internal_project_id").on(table.internalProjectId),
  ],
);

export const fppFiles = pgTable(
  "fpp_file",
  {
    id: uuid("id").notNull(),
    requestId: uuid("request_id").notNull(),
    fileType: varchar("file_type").notNull(),
    fileUrl: varchar("file_url").notNull(),
    fileName: varchar("file_name"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    downloaded: boolean("downloaded").notNull().default(false),
    dmsFileId: uuid("dms_file_id"),
    projectVersion: integer("project_version"),
  },
  (table) => [
    primaryKey({ name: "fpp_file_pkey", columns: [table.id] }),
    foreignKey({
      name: "fpp_file_request_id_fkey",
      columns: [table.requestId],
      foreignColumns: [fppRequests.requestId],
    }),
    index("ix_fpp_file_request_id").on(table.requestId),
  ],
);

export const fppRequestsRelations = relations(fppRequests, ({ many }) => ({
  files: many(fppFiles),
}));

export const fppFilesRelations = relations(fppFiles, ({ one }) => ({
  request: one(fppRequests, {
    fields: [fppFiles.requestId],
    references: [fppRequests.requestId],
  }),
}));

export const fppSchema = {
  fppFiles,
  fppFilesRelations,
  fppRequests,
  fppRequestsRelations,
};
