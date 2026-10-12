import { createDmsWorkflows } from "./workflow-adapter.ts";

const workflows = createDmsWorkflows(false);

export const FileProcessingWorkflow = workflows.FileProcessingWorkflow;
export const SingleFileProcessingWorkflow = workflows.SingleFileProcessingWorkflow;
