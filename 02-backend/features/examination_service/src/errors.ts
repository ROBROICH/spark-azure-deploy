import { defineErrorCatalog } from "evlog";

export const examinationErrors = defineErrorCatalog("examination", {
  PROJECT_DATA_UNAVAILABLE: {
    status: 502,
    message: "Project data unavailable",
    why: "The project data authority did not return a usable response",
    fix: "Retry after project data is available",
  },
  LAW_DATABASE_UNAVAILABLE: {
    status: 502,
    message: "Law database unavailable",
    why: "The law database did not return a usable response",
    fix: "Retry after the law database is available",
  },
  LAW_NORM_REQUEST_INVALID: {
    status: 422,
    message: "Invalid law norm request",
    why: "The selected law or paragraph is empty",
    fix: "Select a law and paragraph",
  },
  LAW_NORM_NOT_FOUND: {
    status: 404,
    message: "Law norm not found",
    why: "The law database has no matching norm",
    fix: "Select an existing law norm",
  },
  LAW_NORM_AMBIGUOUS: {
    status: 409,
    message: "Law norm selection is ambiguous",
    why: "More than one law norm matches the selection",
    fix: "Use a unique law and paragraph selection",
  },
  LAW_NORM_TEXT_MISSING: {
    status: 422,
    message: "Law norm text is missing",
    why: "The selected law norm has no text",
    fix: "Select a law norm with text",
  },
  NORM_MATERIALIZATION_FAILED: {
    status: 500,
    message: "Norm materialization failed",
    why: "The materialized law or norm could not be read after the database mutation",
    fix: "Retry the request and inspect the examination database if it fails again",
  },
  TOPIC_NOT_FOUND: {
    status: 404,
    message: "Topic not found in project",
    why: "The selected topic does not belong to the project",
    fix: "Select a topic from the project",
  },
  PROCESSING_SOURCE_CHANGED: {
    status: 409,
    message: "Processing sources changed",
    why: "The sentence or evidence the result was generated from no longer matches the stored revision",
    fix: "Start a new processing run from the current project state",
  },
});
