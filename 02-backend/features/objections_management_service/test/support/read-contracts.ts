import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$",
});
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const NullableIntegerSchema = T.Union([T.Integer(), T.Null()]);
const NullableNumberSchema = T.Union([T.Number(), T.Null()]);
const UpdateTypeSchema = T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]);

const NodeTypeSchema = T.Union([
  T.Literal("beteiligungs_eingang"),
  T.Literal("beteiligungs_eingang_markdown"),
  T.Literal("argument"),
]);
const ParentTypeSchema = T.Union([
  T.Literal("file"),
  T.Literal("beteiligungs_eingang"),
  T.Literal("topic"),
  T.Literal("subtopic"),
]);
const ParentSchema = T.Object(
  { id: UuidSchema, nodeType: ParentTypeSchema },
  { additionalProperties: false },
);
const NodeSummarySchema = T.Object(
  {
    id: UuidSchema,
    nodeType: NodeTypeSchema,
    parents: T.Array(ParentSchema),
    frontendParentIds: T.Array(T.String()),
    isOutdated: T.Boolean(),
  },
  { additionalProperties: false },
);

export const ProcessedFileIdsSchema = T.Object(
  { fileIds: T.Array(UuidSchema) },
  { additionalProperties: false },
);
export type ProcessedFileIds = Static<typeof ProcessedFileIdsSchema>;

/**
 * The incumbent query uses DISTINCT without ORDER BY. Canonicalizing only this
 * collection after TypeBox parsing freezes membership without promoting a
 * PostgreSQL plan's incidental row order into the migration contract.
 */
export function canonicalizeUnorderedProcessedFileIds(body: ProcessedFileIds): ProcessedFileIds {
  return { fileIds: [...body.fileIds].sort() };
}

export const NodeListSchema = T.Object(
  { nodes: T.Array(NodeSummarySchema) },
  { additionalProperties: false },
);
export type NodeList = Static<typeof NodeListSchema>;

/**
 * The shared node-crud `/nodes` query UNION has no ORDER BY. Canonicalize only
 * that parsed top-level union by its semantic identity; nested array order is
 * part of each node payload and remains untouched.
 */
export function canonicalizeUnorderedNodeList(body: NodeList): NodeList {
  return {
    nodes: [...body.nodes].sort((left, right) => {
      if (left.nodeType !== right.nodeType) return left.nodeType < right.nodeType ? -1 : 1;
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    }),
  };
}

const CommonNodeProperties = {
  id: UuidSchema,
  projectId: UuidSchema,
  isDeleted: T.Boolean(),
  isOutdated: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  projectVersion: T.Integer({ minimum: 1 }),
  updateType: UpdateTypeSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const BeteiligungsEingangNodeSchema = T.Object(
  {
    nodeType: T.Literal("beteiligungs_eingang"),
    beteiligungTyp: T.Union([
      T.Literal("stellungnahme"),
      T.Literal("naturschutz"),
      T.Literal("einwendung"),
      T.Null(),
    ]),
    fileId: UuidSchema,
    filename: NullableStringSchema,
    markdownId: NullableUuidSchema,
    extractionStatus: T.Union([
      T.Literal("success"),
      T.Literal("loading"),
      T.Literal("failed"),
      T.Literal("prompt_injection_error"),
    ]),
    classificationStatus: T.Union([T.Literal("loading"), T.Literal("done"), T.Literal("failed")]),
    ...CommonNodeProperties,
  },
  { additionalProperties: false },
);

const MarkdownNodeSchema = T.Object(
  {
    nodeType: T.Literal("beteiligungs_eingang_markdown"),
    beteiligungsEingangId: UuidSchema,
    text: T.String(),
    ...CommonNodeProperties,
  },
  { additionalProperties: false },
);

const ArgumentNodeSchema = T.Object(
  {
    nodeType: T.Literal("argument"),
    beteiligungsEingangId: UuidSchema,
    subTopicId: NullableUuidSchema,
    topicId: NullableUuidSchema,
    topicConfidence: NullableNumberSchema,
    subTopicConfidence: NullableNumberSchema,
    status: T.Union([T.Literal("open"), T.Literal("subtopic_reviewed"), T.Literal("done")]),
    text: NullableStringSchema,
    startIdx: NullableIntegerSchema,
    endIdx: NullableIntegerSchema,
    erwiderung: NullableStringSchema,
    einordnung: NullableStringSchema,
    context: NullableStringSchema,
    contextStartIdx: NullableIntegerSchema,
    contextEndIdx: NullableIntegerSchema,
    argumentId: NullableStringSchema,
    inVae: T.Boolean(),
    isValidArgument: T.Boolean(),
    ...CommonNodeProperties,
  },
  { additionalProperties: false },
);

export const BatchNodesResponseSchema = T.Object(
  {
    results: T.Array(
      T.Union([BeteiligungsEingangNodeSchema, MarkdownNodeSchema, ArgumentNodeSchema]),
    ),
  },
  { additionalProperties: false },
);

export const ErrorResponseSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
