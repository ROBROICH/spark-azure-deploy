import { Type as T } from "@sinclair/typebox";
import { RechtsmethodikWorkflowOutput } from "@spark-temporal/contracts";
import { t } from "elysia";

export const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

const MAX_NAME_LENGTH = 1_000;

export const NormDeconstructionInputSchema = T.Object(
  {
    jurabk: T.String({ maxLength: MAX_NAME_LENGTH }),
    paragraph: T.String({ maxLength: MAX_NAME_LENGTH }),
    deconstruction: RechtsmethodikWorkflowOutput,
  },
  { additionalProperties: false },
);
export const NormDeconstructionQuerySchema = T.Object(
  {
    jurabk: T.Optional(T.String()),
    paragraph: T.Optional(T.String()),
    limit: t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1, default: 50 }),
    offset: t.Numeric({ minimum: 0, multipleOf: 1, default: 0 }),
  },
  { additionalProperties: false },
);

export const LegalBasisSelectionSchema = T.Object(
  {
    jurabk: T.String({ maxLength: MAX_NAME_LENGTH }),
    paragraphNr: T.String({ maxLength: MAX_NAME_LENGTH }),
  },
  { additionalProperties: false },
);
export const LegalBasisAddRequestSchema = T.Object(
  {
    topicId: UuidSchema,
    // Each norm costs one sequential Law DB request.
    norms: T.Array(LegalBasisSelectionSchema, { maxItems: 100 }),
    type: T.Optional(T.Union([T.Literal("pruefung"), T.Literal("verfahren")])),
  },
  { additionalProperties: false },
);

export const NormDeconstructionResponseSchema = T.Object(
  {
    id: UuidSchema,
    jurabk: T.String(),
    paragraph: T.String(),
    deconstruction: RechtsmethodikWorkflowOutput,
    createdAt: T.Union([T.String(), T.Date()]),
  },
  { additionalProperties: false },
);
const NullableString = T.Union([T.String(), T.Null()]);
export const LegalBasisNormResponseSchema = T.Object(
  {
    jurabk: T.String(),
    paragraphNr: T.String(),
    paragraphTitel: NullableString,
    gesetzTitel: NullableString,
    gesetzKurztitel: NullableString,
    doknr: NullableString,
    bundesland: NullableString,
    dokumentTyp: NullableString,
    gesetz: T.Object(
      {
        nodeType: T.Literal("gesetz"),
        id: T.String(),
        name: T.String(),
        jurabk: T.String(),
        titel: NullableString,
        kurztitel: NullableString,
        doknr: NullableString,
        bundesland: NullableString,
        dokumentTyp: NullableString,
        fundstelle: NullableString,
        standangaben: T.Array(T.String()),
      },
      { additionalProperties: false },
    ),
    norm: T.Object(
      {
        nodeType: T.Literal("norm"),
        id: T.String(),
        gesetzId: T.String(),
        paragraphNr: T.String(),
        paragraphTitel: NullableString,
        text: NullableString,
        regelungsgegenstand: NullableString,
        doknr: NullableString,
        prev: NullableString,
        next: NullableString,
        frontendParentIds: T.Array(T.String()),
        isOutdated: T.Boolean(),
      },
      { additionalProperties: false },
    ),
    isDeconstructed: T.Boolean(),
    deconstructionId: NullableString,
    deconstructionCreatedAt: NullableString,
  },
  { additionalProperties: false },
);
export const LegalBasisAddNormsResponseSchema = T.Object(
  {
    items: T.Array(
      T.Object(
        {
          gesetz: T.Object(
            {
              nodeType: T.Literal("gesetz"),
              id: UuidSchema,
              projectId: UuidSchema,
              projectVersion: T.Integer(),
              name: T.String(),
              jurabk: T.String(),
              frontendParentIds: T.Array(T.String()),
              isDeleted: T.Boolean(),
              isOutdated: T.Boolean(),
              updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
              createdAt: T.Union([T.String(), T.Date()]),
              updatedAt: T.Union([T.String(), T.Date()]),
            },
            { additionalProperties: false },
          ),
          norm: T.Object(
            {
              nodeType: T.Literal("norm"),
              id: UuidSchema,
              projectId: UuidSchema,
              projectVersion: T.Integer(),
              gesetzId: UuidSchema,
              paragraphNr: T.String(),
              paragraphTitel: NullableString,
              text: T.String(),
              regelungsgegenstand: NullableString,
              frontendParentIds: T.Array(T.String()),
              isDeleted: T.Boolean(),
              isOutdated: T.Boolean(),
              updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
              createdAt: T.Union([T.String(), T.Date()]),
              updatedAt: T.Union([T.String(), T.Date()]),
            },
            { additionalProperties: false },
          ),
          topicNorm: T.Object(
            {
              nodeType: T.Literal("topic_norm"),
              id: UuidSchema,
              topicId: UuidSchema,
              projectId: UuidSchema,
              projectVersion: T.Integer(),
              jurabk: T.String(),
              paragraphNr: NullableString,
              type: T.Union([T.Literal("pruefung"), T.Literal("verfahren")]),
              absatz: NullableString,
              satz: NullableString,
              nummer: NullableString,
              mvpStatus: T.String(),
              satzStatuses: T.Record(T.String(), T.String()),
              frontendParentIds: T.Array(T.String()),
              isDeleted: T.Boolean(),
              isOutdated: T.Boolean(),
              updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
              createdAt: T.Union([T.String(), T.Date()]),
              updatedAt: T.Union([T.String(), T.Date()]),
            },
            { additionalProperties: false },
          ),
          createdGesetz: T.Boolean(),
          createdNorm: T.Boolean(),
          createdTopicNorm: T.Boolean(),
          isDeconstructed: T.Boolean(),
          deconstructionId: NullableString,
          deconstructionCreatedAt: NullableString,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const BundeslandSchema = T.Union(
  [
    "BY",
    "BW",
    "BE",
    "BB",
    "HB",
    "HH",
    "HE",
    "MV",
    "NI",
    "NW",
    "RP",
    "SL",
    "SN",
    "ST",
    "SH",
    "TH",
  ].map((value) => T.Literal(value)),
);
