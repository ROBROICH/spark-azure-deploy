import { Kind, Type, TypeRegistry, type Static } from "@sinclair/typebox";

export type NodeJson =
  | string
  | number
  | boolean
  | null
  | NodeJson[]
  | { [key: string]: NodeJson | undefined };

export type NodeBase = {
  nodeType: string;
  id: string;
} & { [key: string]: NodeJson | undefined };

export const NodeSummarySchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    nodeType: Type.String({ minLength: 1 }),
    parents: Type.Array(
      Type.Object(
        {
          nodeType: Type.String({ minLength: 1 }),
          id: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    frontendParentIds: Type.Array(Type.String()),
    isOutdated: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type NodeSummary = Static<typeof NodeSummarySchema>;

const TYPED_ARRAY_KIND = "NodeCrudTypedArray";

if (!TypeRegistry.Has(TYPED_ARRAY_KIND)) {
  TypeRegistry.Set(
    TYPED_ARRAY_KIND,
    (_schema, value) => ArrayBuffer.isView(value) && !(value instanceof DataView),
  );
}

export const NodeDatabaseValueSchema = Type.Recursive((Self) =>
  Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.BigInt(),
    Type.Date(),
    Type.Unsafe<NodeJS.TypedArray<ArrayBufferLike>>({ [Kind]: TYPED_ARRAY_KIND }),
    Type.Array(Self),
    Type.Record(Type.String(), Self),
  ]),
);

export type NodeDatabaseValue = Static<typeof NodeDatabaseValueSchema>;

const NodeDatabaseRowSchema = Type.Record(Type.String(), NodeDatabaseValueSchema);

export type NodeDatabaseRow = Static<typeof NodeDatabaseRowSchema>;

export const NodeDatabaseRowsSchema = Type.Array(NodeDatabaseRowSchema);
