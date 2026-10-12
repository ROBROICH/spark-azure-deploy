import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const DateTimeSchema = T.Transform(T.String({ minLength: 1 }))
  .Decode((value) => new Date(value).toISOString().replace(/\.000Z$/, "Z"))
  .Encode((value) => value);

export const ErrorResponseSchema = T.Object(
  { detail: T.String() },
  { additionalProperties: false },
);

export const RiskSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    problem: T.String(),
    recommendation: NullableStringSchema,
    quote: NullableStringSchema,
    severity: T.Integer({ minimum: 1, maximum: 10 }),
    implication: T.String(),
    status: T.Union([T.Literal("open"), T.Literal("corrected"), T.Literal("ignored")]),
    vaeNodeId: UuidSchema,
  },
  { additionalProperties: false },
);

export const RiskListSchema = T.Array(RiskSchema);

export const TemplateSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String(),
    projectTypeId: UuidSchema,
    version: T.Integer({ minimum: 1 }),
    isActive: T.Boolean(),
  },
  { additionalProperties: false },
);

export const TemplateListSchema = T.Array(TemplateSchema);

export const TemplateNodeSchema = T.Object(
  {
    id: UuidSchema,
    parentVaeNodeId: NullableUuidSchema,
    topic: NullableStringSchema,
    templateId: UuidSchema,
    title: T.String(),
    text: T.String(),
    order: T.Number(),
    canAddChild: T.Boolean(),
    isHidden: T.Boolean(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    sysPeriod: T.Object(
      {
        lower: DateTimeSchema,
        upper: T.Union([DateTimeSchema, T.Null()]),
        bounds: T.String({ minLength: 2, maxLength: 2 }),
        empty: T.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const TemplateNodeListSchema = T.Array(TemplateNodeSchema);

const ParentReferenceSchema = T.Object(
  {
    id: UuidSchema,
    nodeType: T.Union([
      T.Literal("risks"),
      T.Literal("vae_node"),
      T.Literal("topic"),
      T.Literal("subtopic"),
    ]),
  },
  { additionalProperties: false },
);

export const NodeSummarySchema = T.Object(
  {
    id: UuidSchema,
    nodeType: T.Union([T.Literal("risks"), T.Literal("vae_node")]),
    parents: T.Array(ParentReferenceSchema),
    frontendParentIds: T.Array(T.String()),
    isOutdated: T.Boolean(),
  },
  { additionalProperties: false },
);

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

const CommonNodeFields = {
  id: UuidSchema,
  projectId: UuidSchema,
  isDeleted: T.Boolean(),
  isOutdated: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  projectVersion: T.Integer({ minimum: 1 }),
  updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
};

export const FullRiskNodeSchema = T.Object(
  {
    nodeType: T.Literal("risks"),
    vaeNodeId: UuidSchema,
    problem: T.String(),
    recommendation: NullableStringSchema,
    quote: NullableStringSchema,
    severity: T.Integer({ minimum: 1, maximum: 10 }),
    status: T.Union([T.Literal("open"), T.Literal("corrected"), T.Literal("ignored")]),
    implication: T.String(),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);

export const FullVaeNodeSchema = T.Object(
  {
    nodeType: T.Literal("vae_node"),
    parentVaeNodeId: NullableUuidSchema,
    assignee: NullableUuidSchema,
    checkedByAssignee: T.Boolean(),
    checkedByLeader: T.Boolean(),
    checkedAtAssignee: NullableStringSchema,
    checkedAtLeader: NullableStringSchema,
    topicId: NullableUuidSchema,
    subtopicId: NullableUuidSchema,
    templateId: NullableUuidSchema,
    title: T.String(),
    text: T.String(),
    order: T.Number(),
    canAddChild: T.Boolean(),
    isHidden: T.Boolean(),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);

export const BatchNodesResponseSchema = T.Object(
  { results: T.Array(T.Union([FullRiskNodeSchema, FullVaeNodeSchema])) },
  { additionalProperties: false },
);

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
