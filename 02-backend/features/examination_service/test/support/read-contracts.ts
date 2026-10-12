import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";
import { RechtsmethodikWorkflowOutput } from "@spark-temporal/contracts";

export const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.Transform(T.String({ format: "date-time" }))
  .Decode((value) => new Date(value).toISOString().replace(/\.000Z$/, "Z"))
  .Encode((value) => value);
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const UpdateTypeSchema = T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]);

const StandangabeSchema = T.Object(
  { standtyp: NullableStringSchema, standkommentar: NullableStringSchema },
  { additionalProperties: false },
);
const LegalBasisLawSchema = T.Object(
  {
    nodeType: T.Literal("gesetz"),
    id: T.String(),
    name: T.String(),
    jurabk: T.String(),
    titel: NullableStringSchema,
    kurztitel: NullableStringSchema,
    doknr: NullableStringSchema,
    bundesland: NullableStringSchema,
    dokumentTyp: NullableStringSchema,
    fundstelle: NullableStringSchema,
    standangaben: T.Array(StandangabeSchema),
  },
  { additionalProperties: false },
);
const LegalBasisNormInfoSchema = T.Object(
  {
    nodeType: T.Literal("norm"),
    id: T.String(),
    gesetzId: T.String(),
    paragraphNr: T.String(),
    paragraphTitel: NullableStringSchema,
    text: NullableStringSchema,
    regelungsgegenstand: NullableStringSchema,
    doknr: NullableStringSchema,
    prev: NullableStringSchema,
    next: NullableStringSchema,
    frontendParentIds: T.Array(T.String()),
    isOutdated: T.Boolean(),
  },
  { additionalProperties: false },
);
const LegalBasisNormSchema = T.Object(
  {
    jurabk: T.String(),
    paragraphNr: T.String(),
    paragraphTitel: NullableStringSchema,
    gesetzTitel: NullableStringSchema,
    gesetzKurztitel: NullableStringSchema,
    doknr: NullableStringSchema,
    bundesland: NullableStringSchema,
    dokumentTyp: NullableStringSchema,
    gesetz: LegalBasisLawSchema,
    norm: LegalBasisNormInfoSchema,
    isDeconstructed: T.Boolean(),
    deconstructionId: NullableUuidSchema,
    deconstructionCreatedAt: T.Union([TimestampSchema, T.Null()]),
  },
  { additionalProperties: false },
);
export const LegalBasisNormsSchema = T.Array(LegalBasisNormSchema);

export const PaginationHeadersSchema = T.Object(
  {
    totalCount: T.String({ pattern: "^[0-9]+$" }),
    returnedCount: T.String({ pattern: "^[0-9]+$" }),
    offset: T.String({ pattern: "^[0-9]+$" }),
    limit: T.Union([T.String({ pattern: "^[1-9][0-9]*$" }), T.Null()]),
    hasMore: T.Union([T.Literal("true"), T.Literal("false")]),
    nextOffset: T.Union([T.String({ pattern: "^[0-9]+$" }), T.Null()]),
  },
  { additionalProperties: false },
);

const NormDeconstructionSchema = T.Object(
  {
    id: UuidSchema,
    jurabk: T.String(),
    paragraph: T.String(),
    deconstruction: RechtsmethodikWorkflowOutput,
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);
export const NormDeconstructionsSchema = T.Array(NormDeconstructionSchema);

const NodeTypeSchema = T.Union([T.Literal("gesetz"), T.Literal("norm")]);
const ParentSchema = T.Object(
  { id: UuidSchema, nodeType: T.Literal("gesetz") },
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
export const NodeListSchema = T.Object(
  { nodes: T.Array(NodeSummarySchema) },
  { additionalProperties: false },
);

const CommonNodeFields = {
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
const GesetzNodeSchema = T.Object(
  {
    nodeType: T.Literal("gesetz"),
    name: T.String(),
    jurabk: T.String(),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const NormNodeSchema = T.Object(
  {
    nodeType: T.Literal("norm"),
    gesetzId: UuidSchema,
    paragraphNr: T.String(),
    paragraphTitel: NullableStringSchema,
    text: T.String(),
    regelungsgegenstand: NullableStringSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
export const BatchNodesResponseSchema = T.Object(
  { results: T.Array(T.Union([GesetzNodeSchema, NormNodeSchema])) },
  { additionalProperties: false },
);

export const ErrorResponseSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);
const ValidationErrorItemSchema = T.Object(
  {
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String(),
    type: T.String(),
  },
  { additionalProperties: true },
);
export const ValidationErrorResponseSchema = T.Object(
  { detail: T.Array(ValidationErrorItemSchema) },
  { additionalProperties: false },
);

export type NodeType = Static<typeof NodeTypeSchema>;

export function stabilizeErrorForSnapshot(body: Static<typeof ErrorResponseSchema>) {
  return { detail: body.detail.replaceAll("\n", "\\n") };
}

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}

export function readPaginationHeaders(headers: Headers) {
  return parseReadContract(PaginationHeadersSchema, {
    totalCount: headers.get("x-total-count"),
    returnedCount: headers.get("x-returned-count"),
    offset: headers.get("x-offset"),
    limit: headers.get("x-limit"),
    hasMore: headers.get("x-has-more"),
    nextOffset: headers.get("x-next-offset"),
  });
}
