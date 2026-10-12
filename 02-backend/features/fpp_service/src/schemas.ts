import { type Static, Type as T } from "@sinclair/typebox";

const MAX_NAME_LENGTH = 1_000;

export const UuidInputSchema = T.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});
export const NullableStringSchema = T.Union([T.String(), T.Null()]);
export const FppFileTypeSchema = T.Union([
  T.Literal("PLANUNTERLAGEN"),
  T.Literal("ERGAENZENDE_UNTERLAGEN"),
]);

export const FppProjectInputSchema = T.Object(
  {
    requestId: UuidInputSchema,
    internalProjectId: T.String({ minLength: 1, maxLength: MAX_NAME_LENGTH }),
    name: T.String({ minLength: 1, maxLength: MAX_NAME_LENGTH }),
    xml: T.String({ minLength: 1, maxLength: 10_000_000 }),
    files: T.Optional(
      T.Array(
        T.Object(
          {
            fileType: FppFileTypeSchema,
            fileUrl: T.String({ minLength: 1, maxLength: MAX_NAME_LENGTH }),
            fileName: T.Optional(T.Union([T.String({ maxLength: MAX_NAME_LENGTH }), T.Null()])),
          },
          { additionalProperties: false },
        ),
        { default: [], maxItems: 1_000 },
      ),
    ),
  },
  { additionalProperties: false },
);

export const IdParamsSchema = T.Object({ id: UuidInputSchema }, { additionalProperties: false });
export const ConfirmDownloadInputSchema = T.Object(
  {
    dmsFileId: UuidInputSchema,
    projectId: UuidInputSchema,
    projectVersion: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export const FppConfirmDownloadResponseSchema = T.Object(
  {
    status: T.Literal("confirmed"),
    fileId: UuidInputSchema,
    dmsFileId: UuidInputSchema,
  },
  { additionalProperties: false },
);

export type FppProjectInput = Static<typeof FppProjectInputSchema>;

export const FppProjectResponseSchema = T.Object(
  {
    requestId: UuidInputSchema,
    internalProjectId: T.String(),
    name: T.String(),
    status: T.String(),
    createdAt: T.String(),
    updatedAt: T.String(),
  },
  { additionalProperties: false },
);
export const FppFileResponseSchema = T.Object(
  {
    id: UuidInputSchema,
    fileType: FppFileTypeSchema,
    fileUrl: T.String(),
    fileName: NullableStringSchema,
    createdAt: T.String(),
  },
  { additionalProperties: false },
);
export const FppRequestResponseSchema = T.Object(
  {
    requestId: UuidInputSchema,
    internalProjectId: T.String(),
    name: T.String(),
    entryDate: T.Union([T.String(), T.Null()]),
    xml: T.String(),
    state: T.Union([T.String(), T.Null()]),
    company: T.Union([T.String(), T.Null()]),
    addressCombined: T.Union([T.String(), T.Null()]),
    street: T.Union([T.String(), T.Null()]),
    houseNumber: T.Union([T.String(), T.Null()]),
    plz: T.Union([T.String(), T.Null()]),
    location: T.Union([T.String(), T.Null()]),
    country: T.Union([T.String(), T.Null()]),
    email: T.Union([T.String(), T.Null()]),
    phone: T.Union([T.String(), T.Null()]),
    fax: T.Union([T.String(), T.Null()]),
    projectId: T.Union([UuidInputSchema, T.Null()]),
    status: T.String(),
    files: T.Array(FppFileResponseSchema),
    createdAt: T.String(),
    updatedAt: T.String(),
  },
  { additionalProperties: false },
);
