import { defineErrorCatalog } from "evlog";

export const agentOrchestrationErrors = defineErrorCatalog("agent-orchestration", {
  ANONYMIZATION_NOT_FOUND: {
    status: 404,
    message: "No existing anonymization request was found",
    why: "A request without a PDF can only retrieve a retained request owned by the caller",
    fix: "Upload the original PDF with a new request identifier",
  },
  ANONYMIZATION_UPLOAD_CONFLICT: {
    status: 409,
    message: "The request identifier already belongs to a different PDF",
    why: "A repeated upload must match the original document",
    fix: "Use a new request identifier for a new document",
  },
  MISSING_PARAGRAPH: {
    status: 422,
    message: "The topic norm has no paragraph number.",
    why: "Norm examination requires a paragraph number",
    fix: "Set the paragraph number before starting norm examination",
  },
  EMPTY_PDF: {
    status: 400,
    message: "Uploaded PDF is empty.",
    why: "The uploaded file has no bytes",
    fix: "Upload a non-empty PDF file",
  },
  UNSUPPORTED_UPLOAD: {
    status: 415,
    message: "Only PDF uploads are supported.",
    why: "The uploaded file does not start with a PDF signature",
    fix: "Upload a PDF file",
  },
  TEMPORAL_COMMAND_FAILED: {
    status: 500,
    message: "Internal server error",
    why: "Temporal did not complete the requested command",
    fix: "Retry after Temporal is available",
  },
  WORKFLOW_CANCEL_FAILED: {
    status: 500,
    message: "Failed to stop workflow",
    why: "Temporal did not cancel the requested workflow",
    fix: "Retry after Temporal is available",
  },
  NO_DOCUMENTS: {
    status: 422,
    message: "The project has no documents to analyse",
    why: "The AI analysis needs at least one project document",
    fix: "Add documents to the project and start the analysis again",
  },
  WORKFLOW_ALREADY_STARTED: {
    status: 409,
    message: "Workflow already started",
    why: "Temporal already has the requested workflow execution",
    fix: "Use the existing workflow execution",
  },
});

export type AnonymizationRequestError = ReturnType<
  | typeof agentOrchestrationErrors.ANONYMIZATION_NOT_FOUND
  | typeof agentOrchestrationErrors.ANONYMIZATION_UPLOAD_CONFLICT
  | typeof agentOrchestrationErrors.EMPTY_PDF
  | typeof agentOrchestrationErrors.UNSUPPORTED_UPLOAD
  | typeof agentOrchestrationErrors.TEMPORAL_COMMAND_FAILED
>;
