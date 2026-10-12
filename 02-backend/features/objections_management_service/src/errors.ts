import { defineErrorCatalog } from "evlog";

export const objectionsErrors = defineErrorCatalog("objections-management", {
  INVALID_CSV: {
    status: 400,
    message: "Invalid objections CSV",
    why: "The selected CSV cannot be imported into this project",
    fix: "Select a valid objections import CSV for this project",
  },
  INVALID_EXTRACTION_SPAN: {
    status: 422,
    message: "Invalid extraction span",
    why: "An extracted argument or context span starts after it ends",
    fix: "Send spans whose startIdx is not greater than their endIdx",
  },
  INVALID_REFERENCE: {
    status: 422,
    message: "Invalid objections reference",
    why: "The referenced topic or subtopic is not active in this project version or has a different parent",
    fix: "Select an active topic and one of its subtopics in this project version",
  },
  EXTRACTION_RECOVERY_REQUIRED: {
    status: 409,
    message: "Original extraction requires recovery",
    why: "An incomplete argument has no original extraction or was changed after extraction",
    fix: "Review the retained arguments and recover their original extraction before resuming classification",
  },
  CLASSIFICATION_CONFLICT: {
    status: 409,
    message: "Argument changed before classification completed",
    why: "Classification cannot overwrite changed or reviewed arguments or complete an entry partially",
    fix: "Review the current arguments before retrying classification",
  },
  DEPENDENCY_UNAVAILABLE: {
    status: 502,
    message: "Objections dependency unavailable",
    why: "A required core resource operation failed",
    fix: "Retry after the resource is available",
  },
});
