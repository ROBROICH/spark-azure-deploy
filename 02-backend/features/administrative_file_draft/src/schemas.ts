import { Type } from "@sinclair/typebox";

import { NullableTopicValueSchema } from "./topics";

const MAX_TEXT_LENGTH = 50_000;
const MAX_NAME_LENGTH = 1_000;
const MAX_ITEMS = 1_000;

export const UuidSchema = Type.String({ format: "uuid" });
export const DateTimeSchema = Type.String({ format: "date-time" });
export const NullableUuidSchema = Type.Union([UuidSchema, Type.Null()]);
export const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
export const RiskStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("corrected"),
  Type.Literal("ignored"),
]);
export const UpdateTypeSchema = Type.Union([
  Type.Literal("automated"),
  Type.Literal("manual"),
  Type.Null(),
]);

export const RiskResponseSchema = Type.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    problem: Type.String(),
    recommendation: NullableStringSchema,
    quote: NullableStringSchema,
    severity: Type.Integer({ minimum: 1, maximum: 10 }),
    implication: Type.String(),
    status: RiskStatusSchema,
    vaeNodeId: UuidSchema,
  },
  { additionalProperties: false },
);
export const RiskListSchema = Type.Array(RiskResponseSchema);

const RiskTextSchema = Type.String({ maxLength: MAX_TEXT_LENGTH });
const NullableRiskTextSchema = Type.Union([RiskTextSchema, Type.Null()]);

export const CreateRisksSchema = Type.Object(
  {
    risks: Type.Array(
      Type.Object(
        {
          problem: RiskTextSchema,
          recommendation: Type.Optional(NullableRiskTextSchema),
          quote: Type.Optional(NullableRiskTextSchema),
          severity: Type.Integer({ minimum: 1, maximum: 10 }),
          implication: RiskTextSchema,
          vaeNodeId: UuidSchema,
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_ITEMS },
    ),
  },
  { additionalProperties: false },
);

export const UpdateRiskSchema = Type.Object(
  {
    problem: Type.Optional(RiskTextSchema),
    recommendation: Type.Optional(NullableRiskTextSchema),
    quote: Type.Optional(NullableRiskTextSchema),
    severity: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
    implication: Type.Optional(RiskTextSchema),
    status: Type.Optional(RiskStatusSchema),
    vaeNodeId: Type.Optional(UuidSchema),
  },
  { additionalProperties: false },
);

export const TemplateResponseSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String(),
    projectTypeId: UuidSchema,
    version: Type.Integer({ minimum: 1 }),
    isActive: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const TemplateListSchema = Type.Array(TemplateResponseSchema);
export const SuccessResponseSchema = Type.Object(
  { success: Type.Literal(true) },
  { additionalProperties: false },
);

export const TemplateNodeResponseSchema = Type.Object(
  {
    id: UuidSchema,
    parentVaeNodeId: NullableUuidSchema,
    topic: NullableTopicValueSchema,
    templateId: UuidSchema,
    title: Type.String(),
    text: Type.String(),
    order: Type.Number(),
    canAddChild: Type.Boolean(),
    isHidden: Type.Boolean(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    sysPeriod: Type.Object(
      {
        lower: DateTimeSchema,
        upper: Type.Union([DateTimeSchema, Type.Null()]),
        bounds: Type.String({ minLength: 2, maxLength: 2 }),
        empty: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export const TemplateNodeListSchema = Type.Array(TemplateNodeResponseSchema);

export const AssignTemplateSchema = Type.Object(
  {
    topics: Type.Array(
      Type.Object(
        { id: UuidSchema, name: Type.String({ maxLength: MAX_NAME_LENGTH }) },
        { additionalProperties: true },
      ),
      { maxItems: MAX_ITEMS },
    ),
  },
  { additionalProperties: false },
);
