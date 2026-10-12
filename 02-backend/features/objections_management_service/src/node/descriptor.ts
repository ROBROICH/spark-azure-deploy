import { Projects } from "@spark-workflow/core/projects/resource";
import {
  bindNodeRuntime,
  defineNodeDescriptor,
  lowerCaseEnumRule,
  type NodeDescriptor,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { better } from "better-drizzle";
import { Result } from "better-result";
import { Elysia, t } from "elysia";

import { objectionsSchema, type ObjectionsSchema } from "../db/schema";
import { objectionsErrors } from "../errors.ts";
import { addSubtopics, loadTopics } from "../topics.ts";

const UuidSchema = Type.String({ format: "uuid" });
const NullableUuidSchema = Type.Union([UuidSchema, Type.Null()]);
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const NullableIntegerSchema = Type.Union([Type.Integer(), Type.Null()]);
const BeteiligungTypSchema = t.UnionEnum(["stellungnahme", "naturschutz", "einwendung"]);
const BeteiligungTypFieldSchema = t.Nullable(BeteiligungTypSchema);
const ReferenceIdSchema = Type.String();
const NullableReferenceIdSchema = Type.Union([ReferenceIdSchema, Type.Null()]);

export const createOmsModels = () =>
  new Elysia({ name: "objections-management.models" }).model({
    BeteiligungTyp: BeteiligungTypSchema,
  });
const ExtractionStatusSchema = Type.Union([
  Type.Literal("success"),
  Type.Literal("loading"),
  Type.Literal("failed"),
  Type.Literal("prompt_injection_error"),
]);
const ClassificationStatusSchema = Type.Union([
  Type.Literal("loading"),
  Type.Literal("done"),
  Type.Literal("failed"),
]);
const ArgumentStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("subtopic_reviewed"),
  Type.Literal("done"),
]);

export function createObjectionsDescriptor() {
  return defineNodeDescriptor({
    name: "objections-management-service",
    auditLogEnabled: true,
    schema: objectionsSchema,
    nodeMetadata: {
      beteiligungsEingaenge: {
        externalParents: [
          {
            kind: "external",
            field: "fileId",
            nodeType: "file",
            service: "documentManagementService",
          },
        ],
        fieldRules: {
          beteiligungTyp: lowerCaseEnumRule,
          extractionStatus: {
            fromDatabase: lowerCaseEnumRule.fromDatabase,
            toDatabase: (value) =>
              value === "loading" ? value : lowerCaseEnumRule.toDatabase(value),
          },
        },
        schemaOverrides: {
          response: {
            beteiligungTyp: BeteiligungTypFieldSchema,
            extractionStatus: ExtractionStatusSchema,
            classificationStatus: ClassificationStatusSchema,
            filename: NullableStringSchema,
            markdownId: NullableUuidSchema,
          },
          insert: {
            beteiligungTyp: Type.Optional(BeteiligungTypFieldSchema),
            extractionStatus: ExtractionStatusSchema,
            classificationStatus: Type.Optional(ClassificationStatusSchema),
          },
          patch: {
            beteiligungTyp: Type.Optional(BeteiligungTypFieldSchema),
            extractionStatus: Type.Optional(ExtractionStatusSchema),
            classificationStatus: Type.Optional(ClassificationStatusSchema),
          },
        },
      },
      argumentsTable: {
        readonlyFields: ["extractionPayload"],
        externalParents: [
          {
            kind: "external",
            field: "topicId",
            nodeType: "topic",
            service: "projectLogicService",
          },
          {
            kind: "external",
            field: "subTopicId",
            nodeType: "subtopic",
            service: "projectLogicService",
          },
        ],
        schemaOverrides: {
          response: {
            status: ArgumentStatusSchema,
            subTopicId: NullableUuidSchema,
            topicId: NullableUuidSchema,
            text: NullableStringSchema,
            startIdx: NullableIntegerSchema,
            endIdx: NullableIntegerSchema,
            erwiderung: NullableStringSchema,
            einordnung: NullableStringSchema,
            context: NullableStringSchema,
            contextStartIdx: NullableIntegerSchema,
            contextEndIdx: NullableIntegerSchema,
            argumentId: NullableStringSchema,
          },
          insert: { status: Type.Optional(ArgumentStatusSchema) },
          patch: { status: Type.Optional(ArgumentStatusSchema) },
        },
      },
    },
  });
}

export const objectionsDescriptor = createObjectionsDescriptor();

export const objectionsVersionDescriptor: NodeDescriptor = {
  ...objectionsDescriptor,
  nodes: objectionsDescriptor.nodes.map((node) =>
    node.nodeType === "argument"
      ? {
          ...node,
          schemas: {
            ...node.schemas,
            patch: Type.Object(
              {
                ...Type.Omit(node.schemas.patch, ["topicId", "subTopicId"]).properties,
                subTopicId: Type.Optional(Type.Null()),
              },
              { additionalProperties: false },
            ),
          },
        }
      : node,
  ),
};

export const bindObjectionsVersionRuntime = (nodes: NodeRuntime<ObjectionsSchema>) =>
  bindNodeRuntime(objectionsVersionDescriptor, {
    persistence: nodes.persistence,
    versionPeer: nodes.versionPeer,
  });

export const ObjectionsNodes = defineResource<NodeRuntime<ObjectionsSchema>>()(
  "objections-management/Nodes",
);

export const objectionsNodesProvider = provide({
  resource: ObjectionsNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) => {
    const persistence = postgres.scope(objectionsSchema);
    return bindNodeRuntime(objectionsDescriptor, {
      persistence,
      versionPeer: projects,
      prepareMutation: async (projectId, projectVersion, mutation) => {
        const isChild = ({ nodeType }: { readonly nodeType: string }) =>
          nodeType === "argument" || nodeType === "beteiligungs_eingang_markdown";
        const insertedChildren = mutation.inserts.filter(isChild);
        const updatedChildren = mutation.updates.filter(isChild);
        if (insertedChildren.length === 0 && updatedChildren.length === 0) {
          return Result.ok(mutation);
        }
        const scope = { projectId, projectVersion, isDeleted: false };
        const [storedArguments, storedTexts] =
          updatedChildren.length === 0
            ? [[], []]
            : await persistence.query((query) => {
                const database = better(query, { schema: objectionsSchema });
                const ids = updatedChildren.map(({ id }) => id);
                return Promise.all([
                  database.argumentsTable.findMany({
                    select: {
                      id: true,
                      beteiligungsEingangId: true,
                      topicId: true,
                      subTopicId: true,
                    },
                    where: { ...scope, id: { in: ids } },
                  }),
                  database.beteiligungsEingangMarkdown.findMany({
                    select: { id: true, beteiligungsEingangId: true },
                    where: { ...scope, id: { in: ids } },
                  }),
                ]);
              });
        const stored = new Map<
          string,
          {
            readonly beteiligungsEingangId: string;
            readonly topicId?: string | null;
            readonly subTopicId?: string | null;
          }
        >([...storedArguments, ...storedTexts].map((row) => [row.id, row]));
        const references = [
          ...insertedChildren,
          ...updatedChildren.filter(({ id }) => stored.has(id)),
        ].map(({ nodeType, id, payload }) => {
          const current = stored.get(id);
          return {
            id,
            isArgument: nodeType === "argument",
            beteiligungsEingangId: Value.Parse(
              ReferenceIdSchema,
              payload.beteiligungsEingangId ?? current?.beteiligungsEingangId,
            ),
            topicId: Value.Parse(
              NullableReferenceIdSchema,
              payload.topicId === undefined ? (current?.topicId ?? null) : payload.topicId,
            ),
            subTopicId: Value.Parse(
              NullableReferenceIdSchema,
              payload.subTopicId === undefined ? (current?.subTopicId ?? null) : payload.subTopicId,
            ),
          };
        });
        if (references.length === 0) return Result.ok(mutation);
        const entryIds = [...new Set(references.map((item) => item.beteiligungsEingangId))];
        const activeEntries = await persistence.query((query) =>
          better(query, { schema: objectionsSchema }).beteiligungsEingaenge.findMany({
            select: { id: true },
            where: { ...scope, id: { in: entryIds } },
          }),
        );
        const entries = new Set(activeEntries.map(({ id }) => id));
        for (const item of mutation.inserts) {
          if (item.nodeType === "beteiligungs_eingang") entries.add(item.id);
        }
        for (const item of mutation.deletes) {
          if (item.nodeType === "beteiligungs_eingang") entries.delete(item.id);
        }
        const orphan = references.find((item) => !entries.has(item.beteiligungsEingangId));
        if (orphan !== undefined) {
          return Result.err(
            objectionsErrors.INVALID_REFERENCE({
              internal: { projectId, projectVersion, id: orphan.id },
            }),
          );
        }
        const classified = references.filter(
          ({ isArgument, topicId, subTopicId }) =>
            isArgument && (topicId !== null || subTopicId !== null),
        );
        if (classified.length === 0) return Result.ok(mutation);
        const topics = await loadTopics(projects, projectId, projectVersion);
        await addSubtopics(
          projects,
          projectId,
          projectVersion,
          topics,
          classified.map(({ subTopicId }) => subTopicId),
        );
        const invalid = classified.find(({ topicId, subTopicId }) => {
          if (topicId === null || topics.get(topicId)?.kind !== "topic") return true;
          if (subTopicId === null) return false;
          const subtopic = topics.get(subTopicId);
          return subtopic?.kind !== "subtopic" || subtopic.parentTopicId !== topicId;
        });
        if (invalid !== undefined) {
          return Result.err(
            objectionsErrors.INVALID_REFERENCE({
              internal: {
                projectId,
                projectVersion,
                id: invalid.id,
                topicId: invalid.topicId,
                subTopicId: invalid.subTopicId,
              },
            }),
          );
        }
        return Result.ok(mutation);
      },
    });
  },
});
