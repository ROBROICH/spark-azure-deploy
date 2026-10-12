import { defineErrorCatalog } from "evlog";

export const fppErrors = defineErrorCatalog("fpp", {
  DOWNLOAD_CONFLICT: {
    status: 409,
    message: "FPP download receipt does not match the source",
    why: "The ZIP belongs to a different project or version, or the source already has another receipt",
    fix: "Use the original ZIP receipt for this FPP file",
  },
  FILE_VERSION_UNKNOWN: {
    status: 409,
    message: "FPP file has no verified original project version",
    why: "The legacy import does not identify the version that owns its download",
    fix: "Verify the original workflow and ZIP receipt before recovering this file",
  },
  IMPORT_CONFLICT: {
    status: 409,
    message: "FPP import conflicts with its persisted request",
    why: "The request identity or original payload does not match",
    fix: "Retry the unchanged original request",
  },
  ARCHIVE_SET_UNSUPPORTED: {
    status: 409,
    message: "FPP import requires an archive-set decision",
    why: "Multiple plan archives cannot be applied as independent document snapshots",
    fix: "Keep the persisted files pending until their snapshot contract is resolved",
  },
  DOWNLOAD_FAILED: {
    status: 503,
    message: "FPP project imported; file download remains pending",
    why: "The file workflow could not be dispatched",
    fix: "Retry the unchanged import request",
  },
  REQUEST_NOT_FOUND: {
    status: 404,
    message: "FPP request not found",
    why: "The requested FPP import does not exist",
    fix: "Use an existing FPP request identifier",
  },
  FILE_NOT_FOUND: {
    status: 404,
    message: "FPP file not found",
    why: "The requested FPP file does not exist",
    fix: "Use an existing FPP file identifier",
  },
  INVALID_XML: {
    status: 500,
    message: "Invalid FPP XML",
    why: "The FPP payload could not be parsed",
    fix: "Send a valid FPP XML payload with a creation date",
  },
  PROJECT_CREATION_FAILED: {
    status: 500,
    message: "Failed to create project",
    why: "The imported project could not be created",
    fix: "Verify the project type and creator configuration, then retry",
  },
});
