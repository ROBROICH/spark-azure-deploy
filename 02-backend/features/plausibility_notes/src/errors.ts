import { defineErrorCatalog } from "evlog";

export const plausibilityErrors = defineErrorCatalog("plausibility", {
  NOTE_IDENTITY_AMBIGUOUS: {
    status: 409,
    message: "Note identity is ambiguous",
    why: "More than one authorized project has an active note with this identifier",
    fix: "Use the project-scoped note operation",
  },
  RESULT_DELIVERY_CONFLICT: {
    status: 409,
    message: "Result delivery requires recovery",
    why: "A different result file was already applied under this file ID",
    fix: "Deliver the new result under a new file ID",
  },
  NOTE_NOT_FOUND: {
    status: 404,
    message: "Note not found",
    why: "No active plausibility note has this identifier",
    fix: "Refresh the project and use an active note identifier",
  },
});
