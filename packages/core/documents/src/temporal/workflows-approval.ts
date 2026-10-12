import { createDmsWorkflows } from "./workflow-adapter.ts";

const workflows = createDmsWorkflows(true);

export const FileProcessingWorkflow = workflows.FileProcessingWorkflow;
export const SingleFileProcessingWorkflow = workflows.SingleFileProcessingWorkflow;
