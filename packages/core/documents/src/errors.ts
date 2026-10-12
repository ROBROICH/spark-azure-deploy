import { defineErrorCatalog } from "evlog";

export const dmsErrors = defineErrorCatalog("document-management", {
  HTTP_ERROR: {
    status: 500,
    message: "Document Management request failed",
    why: "Document Management could not complete the request",
    fix: "Retry the request",
  },
  INVALID_REQUEST: {
    status: 422,
    message: "Invalid Document Management request",
    why: "The request violates the document lifecycle contract",
    fix: "Correct the request and retry",
  },
  NOT_FOUND: {
    status: 404,
    message: "Document not found",
    why: "The requested document does not exist in this project version",
    fix: "Use an existing document",
  },
  CONFLICT: {
    status: 409,
    message: "Document state conflict",
    why: "The requested operation conflicts with the current document state",
    fix: "Refresh the document state and retry",
  },
  INVALID_TOPIC_PARENT: {
    status: 422,
    message: "Invalid document topic assignment",
    why: "A topic assignment references a topic or subtopic that is not active in its project version",
    fix: "Assign an active topic or subtopic of the same project version",
  },
  INTERNAL_ENDPOINT: {
    status: 403,
    message: "Internal endpoint",
    why: "Internal Document Management routes do not accept user authorization",
    fix: "Call the route through the service identity boundary",
  },
  TEMPORAL_FAILED: {
    status: 500,
    message: "Temporal operation failed",
    why: "The requested document workflow operation did not complete",
    fix: "Retry after Temporal is available",
  },
  STORAGE_NOT_FOUND: {
    status: 404,
    message: "Document object not found",
    why: "The object store does not contain the requested document",
    fix: "Use an existing document object",
  },
  STORAGE_CONFLICT: {
    status: 409,
    message: "Document object already exists",
    why: "The operation would overwrite an existing document object",
    fix: "Use a different object path or remove the existing object",
  },
  STORAGE_UNAVAILABLE: {
    status: 503,
    message: "Document storage unavailable",
    why: "The object store did not answer the request",
    fix: "Retry after the object store is available",
  },
  ZIP_NOT_FOUND: {
    status: 404,
    message: "ZIP file not found in storage",
    why: "The uploaded ZIP object does not exist in the object store",
    fix: "Upload the ZIP again",
  },
  ZIP_INVALID: {
    status: 422,
    message: "ZIP file is invalid",
    why: "The ZIP file is corrupt or exceeds the configured ZIP limits",
    fix: "Upload an intact ZIP within the documented limits",
  },
  ZIP_AMBIGUOUS: {
    status: 422,
    message: "ZIP file is ambiguous",
    why: "The ZIP file can be read differently by different tools",
    fix: "Recreate the ZIP with a standard archive tool",
  },
  ZIP_ENCRYPTED: {
    status: 422,
    message: "ZIP file is encrypted",
    why: "Encrypted ZIP files and entries are not supported",
    fix: "Upload the ZIP without a password",
  },
  ZIP_UNSUPPORTED_COMPRESSION: {
    status: 422,
    message: "ZIP compression method is not supported",
    why: "The ZIP uses a compression method other than stored or deflate",
    fix: "Recreate the ZIP with the deflate compression method",
  },
  ZIP_SPLIT: {
    status: 422,
    message: "Split ZIP files are not supported",
    why: "The ZIP is one part of a multi-part archive",
    fix: "Upload the ZIP as one archive",
  },
  NO_PROCESSABLE_FILES: {
    status: 422,
    message: "ZIP contains no processable PDF files",
    why: "Every entry in the ZIP failed validation",
    fix: "Upload a ZIP that contains valid PDF files",
  },
  UNSUPPORTED_FILETYPE: {
    status: 422,
    message: "File type is not supported",
    why: "Only PDF files can be imported from a ZIP",
    fix: "Remove the file or convert it to PDF",
  },
  INVALID_FILENAME: {
    status: 422,
    message: "Filename must start with [ESN]#### pattern (e.g., E1234.pdf, E1234_report.pdf)",
    why: "EWMS imports identify each submission by its filename",
    fix: "Rename the file to the [ESN]#### pattern",
  },
  VIRUS_DETECTED: {
    status: 422,
    message: "Virus detected",
    why: "The virus scanner reported a threat",
    fix: "Remove the infected file",
  },
});

export const DmsHttpError = dmsErrors.HTTP_ERROR;
export const DmsValidationError = dmsErrors.INVALID_REQUEST;
export const notFound = dmsErrors.NOT_FOUND;
export const conflict = dmsErrors.CONFLICT;
