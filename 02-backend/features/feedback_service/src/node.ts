import { Projects } from "@spark-workflow/core/projects/resource";
import {
  bindNodeRuntime,
  defineNodeDescriptor,
  lowerCaseEnumRule,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";

import { feedbackSchema } from "./db/schema.ts";

export const FeedbackRatingSchema = Type.Union([
  Type.Literal("positive"),
  Type.Literal("negative"),
]);
const FeedbackParentIdsSchema = Type.Array(Type.String({ pattern: "^[^:]+:[\\s\\S]+$" }));

export const feedbackDescriptor = defineNodeDescriptor({
  name: "feedback",
  auditLogEnabled: true,
  schema: feedbackSchema,
  nodeMetadata: {
    feedback: {
      fieldRules: { rating: lowerCaseEnumRule },
      schemaOverrides: {
        response: { rating: FeedbackRatingSchema },
        insert: {
          rating: FeedbackRatingSchema,
          frontendParentIds: Type.Optional(FeedbackParentIdsSchema),
        },
        patch: {
          rating: Type.Optional(FeedbackRatingSchema),
          frontendParentIds: Type.Optional(FeedbackParentIdsSchema),
        },
      },
    },
  },
});

export const FeedbackNodes = defineResource<NodeRuntime<typeof feedbackSchema>>()("feedback/Nodes");

export const feedbackNodesProvider = provide({
  resource: FeedbackNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) =>
    bindNodeRuntime(feedbackDescriptor, {
      persistence: postgres.scope(feedbackSchema),
      versionPeer: projects,
    }),
});
