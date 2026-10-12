import { defineErrorCatalog } from "evlog";

export const projectErrors = defineErrorCatalog("project-logic", {
  INVALID_REQUEST: {
    status: 422,
    message: "Invalid project request",
    why: "The request conflicts with the current project data",
    fix: "Refresh the project and submit valid project data",
  },
  NOT_FOUND: {
    status: 404,
    message: "Project resource not found",
    why: "The requested project resource does not exist",
    fix: "Refresh the project and use an existing resource",
  },
  CONFLICT: {
    status: 409,
    message: "Project state conflict",
    why: "The request does not match the current project state",
    fix: "Refresh the project state and retry",
  },
  UNAVAILABLE: {
    status: 503,
    message: "Project service unavailable",
    why: "A required project resource could not be updated",
    fix: "Retry the request",
  },
});
