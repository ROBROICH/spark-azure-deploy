import { Projects } from "@spark-workflow/core/projects/resource";
import { bindNodeRuntime, defineNodeDescriptor, type NodeRuntime } from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";

import { examinationSchema } from "../db/schema.ts";

const NullableJsonArraySchema = Type.Union([Type.Array(Type.Unknown()), Type.Null()]);

export const examinationDescriptor = defineNodeDescriptor({
  name: "examination-service",
  auditLogEnabled: true,
  schema: examinationSchema,
  nodeMetadata: {
    project: { nodeType: "project" },
    fundstelle: { readonlyFields: ["sourceNodeId"] },
    satz: {
      readonlyFields: ["lastSuzResultId"],
      schemaOverrides: {
        response: { tatbestandsmerkmale: NullableJsonArraySchema },
        insert: { tatbestandsmerkmale: Type.Optional(NullableJsonArraySchema) },
        patch: { tatbestandsmerkmale: Type.Optional(NullableJsonArraySchema) },
      },
    },
    expliziterVerweis: {
      schemaOverrides: {
        response: {
          untergliederung: NullableJsonArraySchema,
          kontext: NullableJsonArraySchema,
        },
        insert: {
          untergliederung: Type.Optional(NullableJsonArraySchema),
          kontext: Type.Optional(NullableJsonArraySchema),
        },
        patch: {
          untergliederung: Type.Optional(NullableJsonArraySchema),
          kontext: Type.Optional(NullableJsonArraySchema),
        },
      },
    },
    dokument: {
      externalParents: [
        {
          kind: "external",
          field: "dmsFileId",
          nodeType: "file",
          service: "documentManagementService",
        },
      ],
    },
  },
});

export const ExaminationNodes = defineResource<NodeRuntime<typeof examinationSchema>>()(
  "examination/Nodes",
);

export const examinationNodesProvider = provide({
  resource: ExaminationNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) =>
    bindNodeRuntime(examinationDescriptor, {
      persistence: postgres.scope(examinationSchema),
      versionPeer: projects,
    }),
});
