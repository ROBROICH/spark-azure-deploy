import { Type, type TObject, type TSchema } from "@sinclair/typebox";
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import {
  boolean,
  customType,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { NodeDefinition, NodeFieldRule } from "../../../src";

const timestampRange = customType<{ data: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const updateType = pgEnum("updatetype", ["AUTOMATED", "MANUAL"]);
export const feedbackRating = pgEnum("feedbackrating", ["POSITIVE", "NEGATIVE"]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    projectVersion: integer("project_version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    isOutdated: boolean("is_outdated").notNull().default(false),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period").notNull(),
    rating: feedbackRating("rating").notNull(),
    reason: varchar("reason", { length: 30 }),
    text: varchar("text", { length: 5000 }),
    userId: uuid("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.projectVersion] })],
);

export const feedbackHistory = pgTable("feedback_history", {
  id: uuid("id"),
  projectId: uuid("project_id"),
  projectVersion: integer("project_version"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }),
  isDeleted: boolean("is_deleted"),
  isOutdated: boolean("is_outdated"),
  frontendParentIds: varchar("frontend_parent_ids").array(),
  updateType: updateType("update_type"),
  sysPeriod: timestampRange("sys_period"),
  rating: feedbackRating("rating"),
  reason: varchar("reason", { length: 30 }),
  text: varchar("text", { length: 5000 }),
  userId: uuid("user_id"),
});

const omittedInsertKeys = new Set([
  "id",
  "projectId",
  "projectVersion",
  "createdAt",
  "updatedAt",
  "isDeleted",
  "sysPeriod",
]);

const lowerCaseEnumRule: NodeFieldRule = {
  toDatabase: (value) => (value === null ? value : `${value}`.toUpperCase()),
  fromDatabase: (value) => (value === null ? value : `${value}`.toLowerCase()),
};

const schemas = () => {
  const selectProperties = Object.fromEntries(
    Object.entries(createSelectSchema(feedback).properties).filter(([key]) => key !== "sysPeriod"),
  );
  const response = Type.Object(
    {
      ...selectProperties,
      createdAt: Type.String({ format: "date-time" }),
      updatedAt: Type.String({ format: "date-time" }),
      updateType: Type.Union([Type.Literal("automated"), Type.Literal("manual"), Type.Null()]),
      rating: Type.Union([Type.Literal("positive"), Type.Literal("negative")]),
    },
    { additionalProperties: false },
  );
  const insertSource = createInsertSchema(feedback);
  const insertProperties = Object.fromEntries(
    Object.entries(insertSource.properties).filter(([key]) => !omittedInsertKeys.has(key)),
  ) as Record<string, TSchema>;
  insertProperties.updateType = Type.Optional(
    Type.Union([Type.Literal("automated"), Type.Literal("manual"), Type.Null()]),
  );
  insertProperties.rating = Type.Union([Type.Literal("positive"), Type.Literal("negative")]);
  const insert = Type.Object(insertProperties, { additionalProperties: false });
  return {
    response,
    insert,
    patch: Type.Object(Type.Partial(insert).properties, { additionalProperties: false }),
  } satisfies { response: TObject; insert: TObject; patch: TObject };
};

export const feedbackNodes = [
  {
    nodeType: "feedback",
    table: feedback,
    fields: [
      "isOutdated",
      "frontendParentIds",
      "updateType",
      "rating",
      "reason",
      "text",
      "userId",
    ],
    readonlyFields: [],
    fieldRules: {
      updateType: lowerCaseEnumRule,
      rating: lowerCaseEnumRule,
    },
    parents: [],
    schemas: schemas(),
  },
] as const satisfies readonly NodeDefinition[];

export const feedbackSchema = {
  feedback,
  feedbackHistory,
};

export const feedbackNodeMetadata = {
  feedback: {
    fieldRules: feedbackNodes[0]!.fieldRules,
    schemas: feedbackNodes[0]!.schemas,
  },
} as const;
