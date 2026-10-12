import { FormatRegistry, Type, type Static, type TSchema } from "@sinclair/typebox";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = (value: string) => !Number.isNaN(Date.parse(value));

if (!FormatRegistry.Has("uuid")) FormatRegistry.Set("uuid", (value) => uuid.test(value));
if (!FormatRegistry.Has("date-time")) FormatRegistry.Set("date-time", dateTime);

export const UUID = Type.String({ $id: "UUID", format: "uuid" });
export const GeneratedUUID = Type.String({ $id: "GeneratedUUID", format: "uuid" });
export const GeneratedStringId = Type.String({ $id: "GeneratedStringId" });
export const DateTime = Type.String({ $id: "DateTime", format: "date-time" });
export const GeneratedDateTime = Type.String({ $id: "GeneratedDateTime", format: "date-time" });

export const StringEnum = <const Values extends Record<string, string>>(values: Values) =>
  Type.Unsafe<Values[keyof Values]>({
    type: "string",
    enum: Object.values(values),
    "x-enum-varnames": Object.keys(values),
  });

export interface TNominal<Schema extends TSchema, Name extends string> extends TSchema {
  static: Schema["static"] & { [Symbol.species]: Name };
}

export function Brand<Schema extends TSchema, Name extends string>(schema: Schema, _name: Name) {
  return schema as TNominal<Schema, Name> & Schema;
}

export const WorkflowName = Brand(Type.String({ minLength: 1 }), "WorkflowName");
export type WorkflowName<Name extends string = string> = Static<typeof WorkflowName> & Name;
