import {
  boolean,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { defineNodeDescriptor } from "../../../src";

export const updateType = pgEnum("updatetype", ["AUTOMATED", "MANUAL"]);

const commonColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull().default(1),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isOutdated: boolean("is_outdated").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
  updateType: updateType("update_type").default("AUTOMATED"),
});

export const authors = pgTable(
  "author",
  {
    ...commonColumns(),
    name: varchar("name").notNull(),
    bio: text("bio"),
  },
  (table) => [primaryKey({ columns: [table.id, table.projectVersion] })],
);

export const books = pgTable(
  "book",
  {
    ...commonColumns(),
    authorId: uuid("author_id").notNull(),
    title: varchar("title").notNull(),
    year: integer("year"),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion] }),
    foreignKey({
      columns: [table.authorId, table.projectVersion],
      foreignColumns: [authors.id, authors.projectVersion],
    }),
  ],
);

export const topicLinkedNotes = pgTable(
  "topic_linked_note",
  {
    ...commonColumns(),
    topicId: uuid("topic_id").notNull(),
    subtopicId: uuid("subtopic_id"),
    text: text("text").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.projectVersion] })],
);

export const representativeSchema = {
  authors,
  books,
  topicLinkedNotes,
};

export const representativeNodeMetadata = {
  authors: {
    fieldRules: {
      name: {
        create: { permissions: ["create"], ignoreValues: [""] },
        update: { permissions: ["update"] },
      },
      bio: {
        create: { permissions: ["assign"], ignoreValues: [null, ""] },
        update: { permissions: ["assign"] },
      },
    },
  },
  topicLinkedNotes: {
    externalParents: [
      {
        kind: "external",
        field: "topicId",
        nodeType: "topic",
        service: "projectLogicService",
      },
      {
        kind: "external",
        field: "subtopicId",
        nodeType: "subtopic",
        service: "projectLogicService",
      },
    ],
  },
} as const;

export const representativeNodes = defineNodeDescriptor({
  name: "representative-app",
  auditLogEnabled: true,
  schema: representativeSchema,
  nodeMetadata: representativeNodeMetadata,
}).nodes;
