import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { agentOrchestrationErrors } from "../errors.ts";

/** Answers an execution Temporal already owns with the catalog conflict; rethrows every other failure. */
export async function startWithConflictMapping<Result>(
  start: () => Promise<Result>,
): Promise<Result> {
  try {
    return await start();
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      throw agentOrchestrationErrors.WORKFLOW_ALREADY_STARTED({
        message: error.message,
        cause: error,
      });
    }
    throw error;
  }
}
