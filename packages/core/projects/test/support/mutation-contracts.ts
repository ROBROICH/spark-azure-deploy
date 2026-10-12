import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

import {BatchNodesResponseSchema, DeadlineSchema, ErrorResponseSchema, ProjectSchema, ProjectTypeSchema, TopicSchema, UuidSchema, } from "./read-contracts.ts";

const WorkflowStatusSchema = T.Union([
  T.Literal("PENDING"),
  T.Literal("RUNNING"),
  T.Literal("COMPLETED"),
  T.Literal("FAILED"),
  T.Literal("CANCELED"),
  T.Literal("TERMINATED"),
  T.Literal("CONTINUED_AS_NEW"),
  T.Literal("TIMED_OUT"),
]);

export const ProjectMutationResponseSchema = ProjectSchema;
export const TopicMutationResponseSchema = TopicSchema;
export const DeadlineMutationResponseSchema = DeadlineSchema;
export const ProjectTypeMutationResponseSchema = T.Array(ProjectTypeSchema);
export const InitializationResponseSchema = T.Object(
  {
    message: T.Union([T.String(), T.Null()]),
    workflowStatus: WorkflowStatusSchema,
  },
  { additionalProperties: false },
);

const NodeSchema = BatchNodesResponseSchema.properties.results.items;
export const NodeMutationResponseSchema = T.Object(
  {
    inserted: T.Array(NodeSchema),
    updated: T.Array(NodeSchema),
    deleted: T.Array(
      T.Object(
        { nodeType: T.String({ minLength: 1 }), id: UuidSchema },
        { additionalProperties: false },
      ),
    ),
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
export const MutationErrorSchema = ErrorResponseSchema;

export function parseMutationContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
