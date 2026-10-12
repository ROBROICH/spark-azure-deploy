import { FormatRegistry } from "@sinclair/typebox";
import { t } from "elysia";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) => uuid.test(value));
}

const Id = t.String({ format: "uuid" });

export const UsecaseIdParamsSchema = t.Object({ usecaseId: Id }, { additionalProperties: false });

const Norm = t.Object(
  {
    jurabk: t.String({ minLength: 1 }),
    paragraphNr: t.Union([t.String(), t.Null()]),
    absatz: t.Union([t.String(), t.Null()]),
    satz: t.Union([t.String(), t.Null()]),
    nummer: t.Union([t.String(), t.Null()]),
  },
  { additionalProperties: false },
);

const Subtopic = t.Object(
  {
    name: t.String({ minLength: 1 }),
    description: t.String(),
    showInMvp: t.Boolean(),
    showInEwm: t.Boolean(),
    showInBeschluss: t.Boolean(),
    pruefungsNorms: t.Array(Norm),
    verfahrensNorms: t.Array(Norm),
  },
  { additionalProperties: false },
);

const Topic = t.Object(
  {
    name: t.String({ minLength: 1 }),
    description: t.String(),
    showInMvp: t.Boolean(),
    showInEwm: t.Boolean(),
    showInBeschluss: t.Boolean(),
    pruefungsNorms: t.Array(Norm),
    verfahrensNorms: t.Array(Norm),
    subtopics: t.Array(Subtopic),
  },
  { additionalProperties: false },
);

export const ProjekttypDocument = t.Object(
  {
    id: Id,
    name: t.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const GesetzesgrundlageDocument = t.Object(
  {
    topics: t.Array(Topic),
    stateNormGroups: t.Record(t.String(), t.Array(Norm)),
    topicStateGroups: t.Record(t.String(), t.Array(t.String())),
  },
  { additionalProperties: false },
);

export const DokumenteDocument = t.Object(
  {
    categories: t.Array(
      t.Object(
        {
          id: Id,
          category: t.String({ minLength: 1 }),
          document_types: t.Array(
            t.Object(
              {
                id: Id,
                name: t.String({ minLength: 1 }),
                description: t.String(),
                expected_count: t.Union([t.Integer(), t.Null()]),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const BeschlussNode = t.Object(
  {
    id: Id,
    parent_vae_node_id: t.Union([Id, t.Null()]),
    title: t.String(),
    text: t.String(),
    topic: t.Union([t.String({ minLength: 1 }), t.Null()]),
    order: t.Number(),
    is_hidden: t.Boolean(),
    can_add_child: t.Boolean(),
  },
  { additionalProperties: false },
);

export const BeschlussDocument = t.Object(
  {
    nodes: t.Array(BeschlussNode, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const UsecaseDocumentTypes = [
  "projekttyp",
  "gesetzesgrundlage",
  "dokumente",
  "beschluss",
] satisfies UsecaseDocumentType[];

export const UsecaseDocumentType = t.Union([
  t.Literal("projekttyp"),
  t.Literal("gesetzesgrundlage"),
  t.Literal("dokumente"),
  t.Literal("beschluss"),
]);

export const UsecaseSchema = t.Object(
  {
    slug: t.String({ format: "uuid" }),
    projekttyp: ProjekttypDocument,
    gesetzesgrundlage: GesetzesgrundlageDocument,
    dokumente: DokumenteDocument,
    beschluss: BeschlussDocument,
  },
  { additionalProperties: false },
);

const UpdatedAt = t.String({ format: "date-time" });

export const UsecaseResponseSchema = t.Object(
  {
    ...UsecaseSchema.properties,
    updatedAt: UpdatedAt,
  },
  { additionalProperties: false },
);

export const UsecaseWriteSchema = t.Object(
  {
    slug: t.Optional(t.String({ format: "uuid" })),
    projekttyp: ProjekttypDocument,
    gesetzesgrundlage: GesetzesgrundlageDocument,
    dokumente: DokumenteDocument,
    beschluss: BeschlussDocument,
  },
  { additionalProperties: false },
);

export const UsecaseUpdateSchema = t.Object(
  {
    ...UsecaseWriteSchema.properties,
    updatedAt: UpdatedAt,
  },
  { additionalProperties: false },
);

export const UsecaseCatalogSchema = t.Object(
  {
    usecases: t.Array(UsecaseSchema),
  },
  { additionalProperties: false },
);

export const UsecaseCatalogResponseSchema = t.Object(
  {
    usecases: t.Array(UsecaseResponseSchema),
  },
  { additionalProperties: false },
);

export type ProjekttypDocument = typeof ProjekttypDocument.static;
export type GesetzesgrundlageDocument = typeof GesetzesgrundlageDocument.static;
export type DokumenteDocument = typeof DokumenteDocument.static;
export type BeschlussDocument = typeof BeschlussDocument.static;
export type BeschlussNode = typeof BeschlussNode.static;
export type UsecaseDocumentType = typeof UsecaseDocumentType.static;
export type Usecase = typeof UsecaseSchema.static;
export type UsecaseResponse = typeof UsecaseResponseSchema.static;
export type UsecaseWrite = typeof UsecaseWriteSchema.static;
export type UsecaseUpdate = typeof UsecaseUpdateSchema.static;
export type UsecaseCatalog = typeof UsecaseCatalogSchema.static;
export type UsecaseCatalogResponse = typeof UsecaseCatalogResponseSchema.static;
