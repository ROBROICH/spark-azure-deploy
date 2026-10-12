import { defineErrorCatalog } from "evlog";

export const formalCompletenessErrors = defineErrorCatalog("formal-completeness", {
  PROJECT_RESPONSE_INVALID: {
    status: 400,
    message: "Invalid Project Logic response",
    why: "The core project data does not satisfy the required contract",
    fix: "Repair the project data and retry",
  },
  PROJECT_TYPE_MISMATCH: {
    status: 409,
    message: "Project type does not match",
    why: "The requested project type differs from the project version's project type",
    fix: "Initialize the required document types with the project's own project type",
  },
  CUSTOM_CATEGORY_NOT_FOUND: {
    status: 404,
    message: "Custom category not found",
    why: "The project version has no custom document category",
    fix: "Initialize the required document types",
  },
  DOCUMENT_TYPE_NOT_FOUND: {
    status: 404,
    message: "Document type not found",
    why: "The project version does not contain the requested document type",
    fix: "Use an active document type",
  },
  SYSTEM_DOCUMENT_TYPE_FORBIDDEN: {
    status: 403,
    message: "System document type cannot be changed",
    why: "Only custom document types can be renamed or deleted",
    fix: "Change a custom document type",
  },
  DOCUMENT_NOT_FOUND: {
    status: 404,
    message: "Document not found",
    why: "The project version does not contain the requested document",
    fix: "Use an active project document",
  },
  TOC_NOTE_NOT_FOUND: {
    status: 404,
    message: "Table of contents note not found",
    why: "The project version does not contain the requested note",
    fix: "Use an active table of contents note",
  },
});
