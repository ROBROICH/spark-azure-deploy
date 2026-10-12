import {
  createNodeEntityResourceRoutes,
  defineNodeEntities,
  nodeDefinition,
  nodePayload,
  nodeV2AuthPolicies,
} from "@spark-workflow/node-crud";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { DmsValidationError } from "./errors.ts";
import { FilenameSchema } from "./files/file-types.ts";
import { documentNodeDescriptor, DocumentNodes, DocumentRuntimeResource } from "./runtime.ts";
import { FileUpdateRequestSchema } from "./schemas.ts";

const FileCreateSchema = Type.Object(
  {
    filename: FilenameSchema,
    type: Type.Union([
      Type.Literal("document"),
      Type.Literal("template"),
      Type.Literal("erwiderungs_import"),
    ]),
    createNewVersion: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const ZipFileCreateSchema = Type.Object(
  {
    filename: FilenameSchema,
    type: Type.Union([Type.Literal("zip"), Type.Literal("ewms_zip")]),
    createNewVersion: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const documentEntities = defineNodeEntities({
  id: "core/documents",
  controller: "core.documents.v2-routes",
  descriptor: documentNodeDescriptor,
  nodes: DocumentNodes,
  needs: { documentRuntime: DocumentRuntimeResource },
  entities: [
    {
      nodeType: "file",
      collection: "files",
      auth: nodeV2AuthPolicies,
      operations: {
        create: { body: FileCreateSchema },
        update: { body: FileUpdateRequestSchema },
        delete: {},
      },
      mutations: ({ documentRuntime, node }, standard) => ({
        async create({ projectId, projectVersion, body }) {
          const input = Value.Parse(FileCreateSchema, body);
          const created = await documentRuntime.files.confirmUpload(
            { ...input, projectId },
            projectVersion,
          );
          if (!("mimeType" in created)) {
            throw DmsValidationError({ message: "Expected a non-ZIP file upload" });
          }
          return nodePayload(nodeDefinition(node, "file"), created);
        },
        async update(input) {
          await standard.findUnique(input);
          await documentRuntime.mutations.updateFile(
            input.id,
            input.projectVersion,
            Value.Parse(FileUpdateRequestSchema, input.body),
          );
          return standard.findUnique(input);
        },
        async delete(input) {
          await standard.findUnique(input);
          await documentRuntime.mutations.deleteFile(input.id, input.projectVersion);
          const deleted = await documentRuntime.files.getFileRow(
            input.id,
            input.projectVersion,
            true,
          );
          if (deleted === undefined) return standard.findUnique(input);
          return nodePayload(nodeDefinition(node, "file"), deleted);
        },
      }),
    },
    {
      nodeType: "zip_file",
      collection: "zip-files",
      auth: nodeV2AuthPolicies,
      operations: {
        create: { body: ZipFileCreateSchema },
        update: false,
        delete: false,
      },
      mutations: ({ documentRuntime, node }) => ({
        async create({ projectId, projectVersion, body }) {
          const input = Value.Parse(ZipFileCreateSchema, body);
          const created = await documentRuntime.files.confirmUpload(
            { ...input, projectId },
            projectVersion,
          );
          if ("mimeType" in created) {
            throw DmsValidationError({ message: "Expected a ZIP file upload" });
          }
          return nodePayload(nodeDefinition(node, "zip_file"), created);
        },
      }),
    },
  ],
});

export { createNodeEntityResourceRoutes };
