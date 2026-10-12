import { Projects } from "@spark-workflow/core/projects/resource";
import {
  defineNodeEntities,
  nodeDefinition,
  nodePayload,
} from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { Value } from "@sinclair/typebox/value";

import { createProjectPolicy, deleteProjectPolicy, updateProjectPolicy } from "./auth-policy.ts";
import { formalCompletenessSchema } from "./db/schema.ts";
import {
  createCustomDocumentType,
  deleteCustomDocumentType,
  updateDocumentAssignment,
  updateDocumentType,
} from "./mutations.ts";
import { formalCompletenessDescriptor, FormalCompletenessNodes } from "./node/descriptor.ts";
import {
  CreateRequiredDocumentTypeSchema,
  PatchDocumentSchema,
  PatchRequiredDocumentTypeSchema,
} from "./schemas.ts";

const auth = {
  create: createProjectPolicy,
  update: updateProjectPolicy,
  delete: deleteProjectPolicy,
};

export const formalCompletenessEntities = defineNodeEntities({
  id: "formal-completeness",
  controller: "formal-completeness-check.v2.nodes",
  descriptor: formalCompletenessDescriptor,
  nodes: FormalCompletenessNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  entities: [
    {
      nodeType: "category",
      collection: "categories",
      auth,
      operations: { create: false, update: false, delete: false },
    },
    {
      nodeType: "document",
      collection: "documents",
      auth,
      operations: {
        create: false,
        update: { body: PatchDocumentSchema },
        delete: false,
      },
      mutations: ({ node, postgres, projects }) => {
        const scope = postgres.scope(formalCompletenessSchema);
        const definition = nodeDefinition(node, "document");
        return {
          async update({ projectId, projectVersion, id, body }) {
            const input = Value.Parse(PatchDocumentSchema, body);
            const updated = await updateDocumentAssignment({
              postgres: scope,
              projects,
              projectId,
              projectVersion,
              target: { kind: "id", id },
              humanRequiredDocumentTypeId: input.humanRequiredDocumentTypeId,
            });
            return nodePayload(definition, updated);
          },
        };
      },
    },
    {
      nodeType: "document_type",
      collection: "document-types",
      auth,
      operations: {
        create: { body: CreateRequiredDocumentTypeSchema },
        update: { body: PatchRequiredDocumentTypeSchema },
        delete: {},
      },
      mutations: ({ node, postgres, projects }) => {
        const scope = postgres.scope(formalCompletenessSchema);
        const definition = nodeDefinition(node, "document_type");
        return {
          async create({ projectId, projectVersion, body }) {
            const input = Value.Parse(CreateRequiredDocumentTypeSchema, body);
            const created = await createCustomDocumentType({
              postgres: scope,
              projects,
              projectId,
              projectVersion,
              documentName: input.documentName,
            });
            return nodePayload(definition, created);
          },
          async update({ projectId, projectVersion, id, body }) {
            const input = Value.Parse(PatchRequiredDocumentTypeSchema, body);
            const updated = await updateDocumentType({
              postgres: scope,
              projects,
              projectId,
              projectVersion,
              documentTypeId: id,
              documentName: input.documentName,
              isResolved: input.isResolved,
            });
            return nodePayload(definition, updated);
          },
          async delete({ projectId, projectVersion, id }) {
            const deleted = await deleteCustomDocumentType({
              postgres: scope,
              projects,
              projectId,
              projectVersion,
              documentTypeId: id,
            });
            return nodePayload(definition, deleted);
          },
        };
      },
    },
    {
      nodeType: "table_of_content_notes",
      collection: "table-of-content-notes",
      auth,
      operations: { create: false, update: false, delete: false },
    },
  ],
});
