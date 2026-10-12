import {
  documentManagementSchema,
  fileType,
  workflowStatus as documentWorkflowStatus,
  zipApprovalStatus,
  zipDiffKind,
} from "../documents/src/db/schema.ts";
import { projectLogicSchema } from "../projects/src/db/schema.ts";
import { updateType } from "./update-type.ts";
import { combineTables } from "@spark-workflow/resource";

export {
  documentWorkflowStatus,
  fileType,
  updateType,
  zipApprovalStatus,
  zipDiffKind,
};

export const coreSchema = combineTables([
  {
    id: "core.shared",
    tables: { updateType, fileType, documentWorkflowStatus, zipApprovalStatus, zipDiffKind },
  },
  { id: "core.projects", tables: projectLogicSchema },
  { id: "core.documents", tables: documentManagementSchema },
]);

export type CoreSchema = typeof coreSchema;
