import { Projects } from "@spark-workflow/core/projects/resource";
import { bindNodeRuntime, defineNodeDescriptor, type NodeRuntime } from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";

import { plausibilitySchema } from "./db/schema.ts";
import {
  NullableMergedCountSchema,
  NullableScoreSchema,
  PlausibilityStatusSchema,
} from "./schemas.ts";

const RatingSchema = Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]);

export const plausibilityDescriptor = defineNodeDescriptor({
  name: "plausibility-notes",
  auditLogEnabled: true,
  schema: plausibilitySchema,
  nodeMetadata: {
    plausibilityNotes: {
      schemaOverrides: {
        response: {
          confidenceScore: NullableScoreSchema,
          scoreA: NullableScoreSchema,
          scoreB: NullableScoreSchema,
          mergedCount: NullableMergedCountSchema,
          rating: RatingSchema,
          status: PlausibilityStatusSchema,
        },
        insert: {
          confidenceScore: Type.Optional(NullableScoreSchema),
          scoreA: Type.Optional(NullableScoreSchema),
          scoreB: Type.Optional(NullableScoreSchema),
          mergedCount: Type.Optional(NullableMergedCountSchema),
          rating: Type.Optional(RatingSchema),
          status: PlausibilityStatusSchema,
        },
        patch: {
          confidenceScore: Type.Optional(NullableScoreSchema),
          scoreA: Type.Optional(NullableScoreSchema),
          scoreB: Type.Optional(NullableScoreSchema),
          mergedCount: Type.Optional(NullableMergedCountSchema),
          rating: Type.Optional(RatingSchema),
          status: Type.Optional(PlausibilityStatusSchema),
        },
      },
    },
    plausibilityNoteOccurrences: {
      externalParents: [
        {
          kind: "external",
          field: "documentId",
          nodeType: "file",
          service: "documentManagementService",
        },
      ],
    },
  },
});

export const PlausibilityNodes = defineResource<NodeRuntime<typeof plausibilitySchema>>()(
  "plausibility-notes/Nodes",
);

export const plausibilityNodesProvider = provide({
  resource: PlausibilityNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) =>
    bindNodeRuntime(plausibilityDescriptor, {
      persistence: postgres.scope(plausibilitySchema),
      versionPeer: projects,
    }),
});
