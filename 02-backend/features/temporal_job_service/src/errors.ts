import { defineErrorCatalog } from "evlog";

export const temporalJobErrors = defineErrorCatalog("temporal-job", {
  INVALID_CONTINUATION: {
    status: 422,
    message: "Invalid Temporal continuation request",
    why: "The continuation does not match the requested workflow scope or lacks its run id",
    fix: "Restart pagination for this scope and preserve the returned workflow run id",
  },
  INVALID_WORKFLOW_FILTER: {
    status: 422,
    message: "Invalid workflow filter",
    why: "workflowIds needs 1 to 100 ids without commas and cannot be combined with workflowId or a root continuation",
    fix: "Send 1 to 100 workflowIds without workflowId or a root continuation",
  },
  ARCHIVE_NOT_READY: {
    status: 503,
    message: "Workflow history is not ready for archival",
    why: "The exact run is still open or its history lacks the native closing event",
    fix: "Retry archival after the run has closed and complete history is available",
  },
  WORKFLOW_READ_FAILED: {
    status: 500,
    message: "An error occurred during workflow retrieval",
    why: "Temporal could not return the requested workflow data",
    fix: "Retry the workflow request",
  },
  WORKFLOW_NOT_FOUND: {
    status: 404,
    message: "Workflow does not exist",
    why: "Temporal has no execution with this workflow id",
    fix: "Use an existing workflow id",
  },
  EXECUTION_TREE_FAILED: {
    status: 500,
    message: "An error occurred during workflow execution tree retrieval",
    why: "Temporal could not return the workflow execution tree",
    fix: "Retry the execution tree request",
  },
  SYSTEM_LOAD_FAILED: {
    status: 500,
    message: "An error occurred during system load retrieval",
    why: "Temporal could not return the running workflow load",
    fix: "Retry the system load request",
  },
});
