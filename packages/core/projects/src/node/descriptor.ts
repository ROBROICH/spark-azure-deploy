import { defineNodeDescriptor, lowerCaseEnumRule } from "@spark-workflow/node-crud";
import { Type } from "@sinclair/typebox";

import { projectLogicSchema } from "../db/schema.ts";

const TopicNormTypeSchema = Type.Union([Type.Literal("pruefung"), Type.Literal("verfahren")]);
const TopicNormStatusSchema = Type.Union([
  Type.Literal("unchecked"),
  Type.Literal("checked"),
  Type.Literal("needs_revision"),
]);
const SatzStatusesSchema = Type.Record(Type.String(), TopicNormStatusSchema);
const topicNormSchemas = {
  response: {
    type: TopicNormTypeSchema,
    mvpStatus: TopicNormStatusSchema,
    satzStatuses: SatzStatusesSchema,
  },
  insert: {
    type: Type.Optional(TopicNormTypeSchema),
    mvpStatus: Type.Optional(TopicNormStatusSchema),
    satzStatuses: Type.Optional(SatzStatusesSchema),
  },
  patch: {
    type: Type.Optional(TopicNormTypeSchema),
    mvpStatus: Type.Optional(TopicNormStatusSchema),
    satzStatuses: Type.Optional(SatzStatusesSchema),
  },
};

export function createProjectLogicNodeDescriptor() {
  return defineNodeDescriptor({
    name: "project-logic-service",
    auditLogEnabled: true,
    schema: projectLogicSchema,
    excludeNodes: ["applicants", "projects"],
    nodeMetadata: {
      deadlines: {
        schemaOverrides: {
          insert: {
            startAt: Type.String({ format: "date" }),
            endAt: Type.String({ format: "date" }),
          },
          patch: {
            startAt: Type.Optional(Type.String({ format: "date" })),
            endAt: Type.Optional(Type.String({ format: "date" })),
          },
        },
      },
      topicNorms: {
        fieldRules: { type: lowerCaseEnumRule },
        schemaOverrides: topicNormSchemas,
      },
    },
  });
}
