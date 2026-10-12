import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

import { BatchNodesResponseSchema } from "./read-contracts.ts";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const FeedbackNodeSchema = BatchNodesResponseSchema.properties.results.items;
const DeletedNodeSchema = T.Object(
  { nodeType: T.Literal("feedback"), id: UuidSchema },
  { additionalProperties: false },
);

export const NodeMutationResponseSchema = T.Object(
  {
    inserted: T.Array(FeedbackNodeSchema),
    updated: T.Array(FeedbackNodeSchema),
    deleted: T.Array(DeletedNodeSchema),
  },
  { additionalProperties: false },
);
export const CopyVersionResponseSchema = T.Object(
  { dryRun: T.Boolean(), copied: T.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export const UndoVersionResponseSchema = T.Object(
  { deleted: T.Record(T.String({ minLength: 1 }), T.Integer({ minimum: 0 })) },
  { additionalProperties: false },
);
export const DetailErrorSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);
const ValidationIssueSchema = T.Object(
  {
    type: T.String(),
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String(),
  },
  { additionalProperties: true },
);
export const ValidationErrorSchema = T.Object(
  { detail: T.Array(ValidationIssueSchema) },
  { additionalProperties: false },
);

export function parseMutationContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
