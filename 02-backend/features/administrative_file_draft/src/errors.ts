import { defineErrorCatalog } from "evlog";

export const administrativeFileDraftErrors = defineErrorCatalog("administrative-file-draft", {
  INVALID_EXPORT_STRUCTURE: {
    status: 409,
    message: "Draft contains an invalid parent cycle",
    why: "Some visible chapters cannot be reached from a draft root",
    fix: "Repair the chapter parent references before exporting",
  },
  RISK_NOT_FOUND: {
    status: 404,
    message: "Risk not found",
    why: "The requested risk does not exist in the active project version",
    fix: "Refresh the project and use an existing risk",
  },
  EXPORT_NOT_FOUND: {
    status: 404,
    message: "No exportable content found",
    why: "The active project version has no visible draft content",
    fix: "Add visible draft content before export",
  },
  DOCUMENT_CONVERSION_FAILED: {
    status: 502,
    message: "Document conversion failed",
    why: "The document converter could not create the requested format",
    fix: "Retry after the document converter is available",
  },
  INVALID_VAE_NODE: {
    status: 422,
    message: "Unknown VAE node",
    why: "The risk references a VAE node outside its project version",
    fix: "Use a VAE node of the risk's project version",
  },
  INVALID_CHAPTER_PARENT: {
    status: 422,
    message: "Invalid chapter parent",
    why: "A chapter references a topic or subtopic that is not active in its project version",
    fix: "Use an active topic or subtopic of the same project version",
  },
  INVALID_TOPIC: {
    status: 422,
    message: "Unknown topic",
    why: "The topic is not a catalog display name or a known topic key",
    fix: "Use a topic from the usecase catalog",
  },
});
