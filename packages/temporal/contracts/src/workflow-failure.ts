import { type Static, Type } from "@sinclair/typebox";

/**
 * Failures ZIP processing detects; each has a `dmsErrors` entry in `@spark-workflow/core`, which derives
 * its ZIP code lists from this group and `processingFailureCodes`.
 */
export const zipFailureCodes = [
  "ZIP_INVALID",
  "ZIP_AMBIGUOUS",
  "ZIP_ENCRYPTED",
  "ZIP_UNSUPPORTED_COMPRESSION",
  "ZIP_SPLIT",
  "ZIP_NOT_FOUND",
  "NO_PROCESSABLE_FILES",
  "UNSUPPORTED_FILETYPE",
  "INVALID_FILENAME",
  "VIRUS_DETECTED",
] as const;

/** Run outcomes the ZIP workflow derives from a failed, canceled, or timed-out step. */
export const processingFailureCodes = [
  "PROCESSING_FAILED",
  "PROCESSING_CANCELED",
  "PROCESSING_TIMED_OUT",
] as const;

/**
 * Failures of an AI analysis run. They have their own codes because the user restarts the analysis
 * instead of uploading a ZIP again.
 */
export const analysisFailureCodes = [
  "ANALYSIS_FAILED",
  "ANALYSIS_CANCELED",
  "ANALYSIS_TIMED_OUT",
  "NO_DOCUMENTS",
] as const;

/** Every code a Temporal workflow failure may carry as its `ApplicationFailure` type. */
export const workflowFailureCodes = [
  ...zipFailureCodes,
  ...processingFailureCodes,
  ...analysisFailureCodes,
] as const;

export type WorkflowFailureCode = (typeof workflowFailureCodes)[number];

export const WorkflowFailureCodeSchema = Type.Union(
  workflowFailureCodes.map((code) => Type.Literal(code)),
);

export const WorkflowFailureBranchSchema = Type.Object(
  {
    branch: Type.String({ minLength: 1 }),
    errorCode: WorkflowFailureCodeSchema,
  },
  { additionalProperties: false },
);

/** The first `ApplicationFailure.details` entry of a workflow that failed in named branches. */
export const WorkflowFailureDetailsSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    branches: Type.Array(WorkflowFailureBranchSchema),
  },
  { additionalProperties: false },
);

export type WorkflowFailureBranch = Static<typeof WorkflowFailureBranchSchema>;
export type WorkflowFailureDetails = Static<typeof WorkflowFailureDetailsSchema>;
