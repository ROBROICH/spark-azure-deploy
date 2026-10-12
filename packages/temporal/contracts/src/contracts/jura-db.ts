import { Type, type Static } from "@sinclair/typebox";

import type { WorkflowName } from "../registry.js";

export const JURA_DB_TASK_QUEUE = "rechtsprechung" as const;
export const JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW =
  "UpdateRechtsprechungWorkflow" as WorkflowName<"UpdateRechtsprechungWorkflow">;

const contracts = Type.Module({
  UpdateRechtsprechungInput: Type.Object({
    overwrite: Type.Optional(Type.Boolean({ default: false })),
    offset: Type.Optional(Type.Union([Type.Integer(), Type.Null()], { default: null })),
    maxDocuments: Type.Optional(Type.Union([Type.Integer(), Type.Null()], { default: null })),
  }),
  UpdateRechtsprechungOutput: Type.Object({
    written: Type.Integer(),
    skipped: Type.Integer(),
    duplicate: Type.Integer(),
    failed: Type.Integer(),
  }),
});

export const UpdateRechtsprechungInput = contracts.Import("UpdateRechtsprechungInput");
export const UpdateRechtsprechungOutput = contracts.Import("UpdateRechtsprechungOutput");

export type UpdateRechtsprechungInput = Static<typeof UpdateRechtsprechungInput>;
export type UpdateRechtsprechungOutput = Static<typeof UpdateRechtsprechungOutput>;
