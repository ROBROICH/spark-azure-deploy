import { defineNodeDescriptor, lowerCaseEnumRule } from "@spark-workflow/node-crud";
import { type Static, Type, type TSchema } from "@sinclair/typebox";
import { Result } from "better-result";
import { and, eq, inArray } from "drizzle-orm";
import type { EvlogError } from "evlog";

import { subtopics, topics } from "../../../projects/src/db/schema.ts";
import type { DmsDatabase } from "../db.ts";
import { documentManagementSchema } from "../db/schema.ts";
import { dmsErrors } from "../errors.ts";
import {
  ApprovalStatusSchema,
  FileTypeSchema,
  UuidSchema,
  WorkflowStatusSchema,
  ZipWorkflowFailureCodeSchema,
} from "../schemas.ts";

const nullable = <Schema extends TSchema>(schema: Schema) => Type.Union([schema, Type.Null()]);
const NullableStringSchema = nullable(Type.String());
const NullableZipWorkflowFailureCodeSchema = nullable(ZipWorkflowFailureCodeSchema);
const NullableUuidSchema = nullable(UuidSchema);
const NullableIntegerSchema = nullable(Type.Integer({ minimum: 1 }));

export const FileTopicParentsSchema = Type.Object({
  topicId: Type.Optional(nullable(Type.String())),
  subtopicId: Type.Optional(nullable(Type.String())),
});

const FILE_TOPIC_PARENT_BATCH_SIZE = 32_000;

export async function validateFileTopicParents(
  database: DmsDatabase,
  projectId: string,
  projectVersions: readonly number[],
  assignments: readonly Static<typeof FileTopicParentsSchema>[],
): Promise<Result<void, EvlogError>> {
  for (const [table, field] of [
    [topics, "topicId"],
    [subtopics, "subtopicId"],
  ] as const) {
    const ids = [
      ...new Set(
        assignments.flatMap((assignment) => {
          const id = assignment[field];
          return id === undefined || id === null ? [] : [id];
        }),
      ),
    ];
    for (let offset = 0; offset < ids.length; offset += FILE_TOPIC_PARENT_BATCH_SIZE) {
      const requested = ids.slice(offset, offset + FILE_TOPIC_PARENT_BATCH_SIZE);
      const rows = await database
        .select({ id: table.id })
        .from(table)
        .where(
          and(
            eq(table.projectId, projectId),
            inArray(table.projectVersion, [...projectVersions]),
            eq(table.isDeleted, false),
            inArray(table.id, requested),
          ),
        );
      const active = new Set(rows.map(({ id }) => id));
      if (requested.some((id) => !active.has(id))) {
        return Result.err(dmsErrors.INVALID_TOPIC_PARENT());
      }
    }
  }
  return Result.ok(undefined);
}

export function createDocumentManagementDescriptor() {
  return defineNodeDescriptor({
    name: "document-management-service",
    auditLogEnabled: false,
    schema: documentManagementSchema,
    nodeMetadata: {
      files: {
        fieldRules: { type: lowerCaseEnumRule },
        schemaOverrides: {
          response: {
            type: FileTypeSchema,
            version: Type.Integer({ minimum: 1 }),
            addedInVersion: NullableIntegerSchema,
            workflowId: NullableStringSchema,
            runId: NullableStringSchema,
            vectorSearchable: nullable(Type.Boolean()),
            sourceZipFileId: NullableUuidSchema,
            workflowStatus: nullable(WorkflowStatusSchema),
          },
          insert: {
            type: FileTypeSchema,
            version: Type.Optional(Type.Integer({ minimum: 1 })),
            addedInVersion: Type.Optional(NullableIntegerSchema),
            workflowId: Type.Optional(NullableStringSchema),
            runId: Type.Optional(NullableStringSchema),
            vectorSearchable: Type.Optional(nullable(Type.Boolean())),
            sourceZipFileId: Type.Optional(NullableUuidSchema),
            workflowStatus: Type.Optional(nullable(WorkflowStatusSchema)),
          },
          patch: {
            type: Type.Optional(FileTypeSchema),
            version: Type.Optional(Type.Integer({ minimum: 1 })),
            addedInVersion: Type.Optional(NullableIntegerSchema),
            workflowId: Type.Optional(NullableStringSchema),
            runId: Type.Optional(NullableStringSchema),
            vectorSearchable: Type.Optional(nullable(Type.Boolean())),
            sourceZipFileId: Type.Optional(NullableUuidSchema),
            workflowStatus: Type.Optional(nullable(WorkflowStatusSchema)),
          },
        },
      },
      fileTopics: {
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
      zipFiles: {
        fieldRules: { type: lowerCaseEnumRule },
        schemaOverrides: {
          response: {
            type: FileTypeSchema,
            workflowStatus: WorkflowStatusSchema,
            approvalStatus: ApprovalStatusSchema,
            approvalError: NullableStringSchema,
            workflowFailureCode: NullableZipWorkflowFailureCodeSchema,
            sourceProjectVersion: NullableIntegerSchema,
          },
          insert: {
            type: Type.Optional(FileTypeSchema),
            workflowStatus: Type.Optional(WorkflowStatusSchema),
            approvalStatus: Type.Optional(ApprovalStatusSchema),
            approvalError: Type.Optional(NullableStringSchema),
            workflowFailureCode: Type.Optional(NullableZipWorkflowFailureCodeSchema),
            sourceProjectVersion: Type.Optional(NullableIntegerSchema),
          },
          patch: {
            type: Type.Optional(FileTypeSchema),
            workflowStatus: Type.Optional(WorkflowStatusSchema),
            approvalStatus: Type.Optional(ApprovalStatusSchema),
            approvalError: Type.Optional(NullableStringSchema),
            workflowFailureCode: Type.Optional(NullableZipWorkflowFailureCodeSchema),
            sourceProjectVersion: Type.Optional(NullableIntegerSchema),
          },
        },
      },
    },
  });
}
