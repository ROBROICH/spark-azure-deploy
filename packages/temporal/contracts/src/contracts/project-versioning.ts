import { Type, type Static } from "@sinclair/typebox";

import { UUID, type WorkflowName } from "../registry.js";

export const PROJECT_VERSIONING_TASK_QUEUE = "project_logic_service" as const;
export const PROJECT_VERSIONING_CREATE_WORKFLOW =
  "CreateProjectVersionWorkflow" as WorkflowName<"CreateProjectVersionWorkflow">;

const contracts = Type.Module({
  FileDiffEntry: Type.Object(
    {
      fileId: UUID,
      filename: Type.Optional(Type.String()),
      oldName: Type.Optional(Type.String()),
      newName: Type.Optional(Type.String()),
      targetFilename: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
  FileDiffSummary: Type.Object(
    {
      deleted: Type.Optional(Type.Array(Type.Ref("FileDiffEntry"), { default: [] })),
      changed: Type.Optional(Type.Array(Type.Ref("FileDiffEntry"), { default: [] })),
      renamed: Type.Optional(Type.Array(Type.Ref("FileDiffEntry"), { default: [] })),
    },
    { additionalProperties: false },
  ),
  CreateProjectVersionInput: Type.Object(
    {
      projectId: UUID,
      zipFileId: Type.Optional(Type.Union([UUID, Type.Null()])),
      fileDiff: Type.Optional(Type.Ref("FileDiffSummary")),
    },
    { additionalProperties: false },
  ),
  CreateProjectVersionOutput: Type.Object({
    status: Type.String(),
    newVersion: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
    idMappings: Type.Optional(
      Type.Union([
        Type.Record(Type.String(), Type.Record(Type.String(), Type.String())),
        Type.Null(),
      ]),
    ),
    message: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
});

export const FileDiffEntry = contracts.Import("FileDiffEntry");
export const FileDiffSummary = contracts.Import("FileDiffSummary");
export const CreateProjectVersionInput = contracts.Import("CreateProjectVersionInput");
export const CreateProjectVersionOutput = contracts.Import("CreateProjectVersionOutput");

export type FileDiffEntry = Static<typeof FileDiffEntry>;
export type FileDiffSummary = Static<typeof FileDiffSummary>;
export type CreateProjectVersionInput = Static<typeof CreateProjectVersionInput>;
export type CreateProjectVersionOutput = Static<typeof CreateProjectVersionOutput>;
export type CreateProjectVersionWorkflow = (
  input: CreateProjectVersionInput,
) => Promise<CreateProjectVersionOutput>;
