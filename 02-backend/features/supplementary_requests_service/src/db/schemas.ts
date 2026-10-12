import { Type as T } from "@sinclair/typebox";

export const SupplementaryRequestUuidSchema = T.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});

export const SupplementaryRequestPrioritySchema = T.Union([T.Literal("must"), T.Literal("should")]);

export const SupplementaryRequestSourceTypeSchema = T.Union([
  T.Literal("tableOfContents"),
  T.Literal("requiredDocuments"),
  T.Literal("contradiction"),
  T.Literal("materialLaw"),
  T.Literal("materialNorm"),
  T.Literal("materialSatz"),
  T.Literal("materialFundstelle"),
  T.Literal("manual"),
]);

export const SupplementaryRequestSourceRefSchema = T.Object(
  {
    type: SupplementaryRequestSourceTypeSchema,
    itemId: T.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);

export const CreateSupplementaryRequestSchema = T.Object(
  {
    title: T.String({ minLength: 1, maxLength: 2_000 }),
    reason: T.Optional(T.String({ maxLength: 2_000 })),
    priority: SupplementaryRequestPrioritySchema,
    sourceRef: T.Optional(T.Union([SupplementaryRequestSourceRefSchema, T.Null()])),
    includedInLetter: T.Optional(T.Boolean()),
    topicId: T.Optional(T.Union([SupplementaryRequestUuidSchema, T.Null()])),
    documentId: T.Optional(T.Union([SupplementaryRequestUuidSchema, T.Null()])),
  },
  { additionalProperties: false },
);

export const UpdateSupplementaryRequestSchema = T.Object(
  {
    title: T.Optional(CreateSupplementaryRequestSchema.properties.title),
    reason: T.Optional(T.String({ maxLength: 2_000 })),
    priority: T.Optional(SupplementaryRequestPrioritySchema),
    sourceRef: T.Optional(T.Union([SupplementaryRequestSourceRefSchema, T.Null()])),
    includedInLetter: T.Optional(T.Boolean()),
    topicId: T.Optional(T.Union([SupplementaryRequestUuidSchema, T.Null()])),
    documentId: T.Optional(T.Union([SupplementaryRequestUuidSchema, T.Null()])),
  },
  { additionalProperties: false },
);

export const SupplementaryRequestResponse = T.Object(
  {
    id: SupplementaryRequestUuidSchema,
    projectId: SupplementaryRequestUuidSchema,
    title: T.String({ minLength: 1, maxLength: 2_000 }),
    reason: T.Union([T.String({ maxLength: 2_000 }), T.Null()]),
    priority: SupplementaryRequestPrioritySchema,
    sourceRef: T.Union([SupplementaryRequestSourceRefSchema, T.Null()]),
    includedInLetter: T.Boolean(),
    topicId: T.Union([SupplementaryRequestUuidSchema, T.Null()]),
    documentId: T.Union([SupplementaryRequestUuidSchema, T.Null()]),
    createdAt: T.Union([T.String(), T.Date()]),
    updatedAt: T.Union([T.String(), T.Date()]),
  },
  { additionalProperties: false },
);
