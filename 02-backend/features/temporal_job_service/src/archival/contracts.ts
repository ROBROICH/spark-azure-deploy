import { Type as T, type Static } from "@sinclair/typebox";

const nonEmpty = () => T.String({ minLength: 1 });

export const WorkflowKeySchema = T.Tuple([nonEmpty(), nonEmpty()]);

export const ArchivalStatusSchema = T.Union([
  T.Literal("failed"),
  T.Literal("completed"),
  T.Literal("terminated"),
  T.Literal("cancelled"),
  T.Literal("timed_out"),
]);

export const UnarchivedRowSchema = T.Object(
  {
    workflowId: nonEmpty(),
    runId: nonEmpty(),
    workflowType: nonEmpty(),
    projectId: T.Union([nonEmpty(), T.Null()]),
    projectVersion: T.Union([nonEmpty(), T.Null()]),
    status: ArchivalStatusSchema,
  },
  { additionalProperties: false },
);

export const UnarchivedRowsSchema = T.Array(UnarchivedRowSchema);

export const ListUnarchivedBatchInputSchema = T.Object(
  {
    batchSize: T.Integer({ minimum: 1 }),
    excludedKeys: T.Array(WorkflowKeySchema),
  },
  { additionalProperties: false },
);

export const ArchiveOneInputSchema = T.Object(
  { row: UnarchivedRowSchema },
  { additionalProperties: false },
);

export const WeeklyArchivalInputSchema = T.Object(
  {
    batchSize: T.Optional(T.Integer({ minimum: 1 })),
    failedSoFar: T.Optional(T.Integer({ minimum: 0 })),
    archivedSoFar: T.Optional(T.Integer({ minimum: 0 })),
    failedKeys: T.Optional(T.Array(WorkflowKeySchema)),
  },
  { additionalProperties: false },
);

export type WorkflowKey = Static<typeof WorkflowKeySchema>;
export type UnarchivedRow = Static<typeof UnarchivedRowSchema>;
export type ListUnarchivedBatchInput = Static<typeof ListUnarchivedBatchInputSchema>;
export type ArchiveOneInput = Static<typeof ArchiveOneInputSchema>;
export type WeeklyArchivalInput = Static<typeof WeeklyArchivalInputSchema>;
