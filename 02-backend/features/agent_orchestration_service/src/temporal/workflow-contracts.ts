import type {
  DMSFileResponse,
  ProcessDocumentsWorkflowOutput,
  WorkflowFailureCode,
  WorkflowFailureDetails,
} from "@spark-temporal/contracts";
import {
  CancelledFailure,
  ChildWorkflowFailure,
  TerminatedFailure,
  TimeoutFailure,
  type ActivityOptions,
} from "@temporalio/common";

export const NODE_VERSION_CONFLICT_TYPE = "node-crud.CONFLICT";

export const WORKFLOW_RESULT_LABELS = {
  contentExtraction: "inhaltsextraktion",
  formalCompleteness: "formalpruefung",
  plausibility: "plausibilitaetspruefung",
  tableOfContents: "inhaltsverzeichnismatching",
} as const;

export interface WorkflowResultItem<Result extends object, WorkflowType extends string> {
  workflowType: WorkflowType;
  result: Result | null;
  error: string | null;
  errorCode: WorkflowFailureCode | null;
}

export type ClassificationWorkflowResultItem =
  | WorkflowResultItem<DMSFileResponse, typeof WORKFLOW_RESULT_LABELS.formalCompleteness>
  | WorkflowResultItem<DMSFileResponse, typeof WORKFLOW_RESULT_LABELS.tableOfContents>;

export type DmsWorkflowResultItem =
  | ClassificationWorkflowResultItem
  | WorkflowResultItem<DMSFileResponse, typeof WORKFLOW_RESULT_LABELS.plausibility>;

export type FvpWorkflowResultItem =
  | WorkflowResultItem<
      ProcessDocumentsWorkflowOutput,
      typeof WORKFLOW_RESULT_LABELS.contentExtraction
    >
  | DmsWorkflowResultItem;

export interface FvpWorkflowResult {
  results: FvpWorkflowResultItem[];
}

/** Activity payload for an FVP step whose domain failure the workflow turns into its failure type. */
export type FvpActivityResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly failure: { readonly code: WorkflowFailureCode; readonly message: string };
    };

export const ACTIVITY_OPTIONS = {
  default: {
    startToCloseTimeout: "1 minute",
    retry: {
      maximumAttempts: 3,
      maximumInterval: "1 minute",
      nonRetryableErrorTypes: [NODE_VERSION_CONFLICT_TYPE],
    },
  },
  fppDownload: {
    startToCloseTimeout: "10 minutes",
    retry: {
      maximumAttempts: 5,
      maximumInterval: "5 seconds",
    },
  },
  resultDelivery: {
    startToCloseTimeout: "10 minutes",
    retry: {
      maximumAttempts: 5,
      maximumInterval: "1 minute",
    },
  },
  extractionWrite: {
    startToCloseTimeout: "30 minutes",
    retry: {
      initialInterval: "3 seconds",
      backoffCoefficient: 2,
      maximumInterval: "30 seconds",
    },
  },
} satisfies Record<string, ActivityOptions>;

type CancellationPredicate = (reason: Error) => boolean;

export function branchFailureCode(reason: Error): WorkflowFailureCode {
  if (reason instanceof ChildWorkflowFailure) {
    if (reason.cause instanceof TimeoutFailure) return "ANALYSIS_TIMED_OUT";
    if (reason.cause instanceof CancelledFailure || reason.cause instanceof TerminatedFailure) {
      return "ANALYSIS_CANCELED";
    }
  }
  return "ANALYSIS_FAILED";
}

// A child failure carries the fixed SDK message "Child Workflow execution failed";
// the innermost cause names what went wrong. The depth bound guards a cyclic chain.
function innermostFailureMessage(reason: Error): string {
  let failure = reason;
  for (let depth = 0; depth < 10 && failure.cause instanceof Error; depth += 1) {
    failure = failure.cause;
  }
  return failure.message;
}

export function failedResultItem<WorkflowType extends string>(
  workflowType: WorkflowType,
  reason: Error,
): WorkflowResultItem<never, WorkflowType> {
  return {
    workflowType: workflowType,
    result: null,
    error: innermostFailureMessage(reason),
    errorCode: branchFailureCode(reason),
  };
}

export function settledResultItem<Result extends object, WorkflowType extends string>(
  workflowType: WorkflowType,
  outcome: PromiseSettledResult<Result>,
  rethrowCancellation?: CancellationPredicate,
): WorkflowResultItem<Result, WorkflowType> {
  if (outcome.status === "rejected") {
    if (rethrowCancellation?.(outcome.reason) === true) throw outcome.reason;
    const reason =
      outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason));
    return failedResultItem(workflowType, reason);
  }
  return {
    workflowType: workflowType,
    result: outcome.value,
    error: null,
    errorCode: null,
  };
}

export function emptyResultItem<WorkflowType extends string>(
  workflowType: WorkflowType,
): WorkflowResultItem<never, WorkflowType> {
  return { workflowType: workflowType, result: null, error: null, errorCode: null };
}

export function isFailedResultItem(item: WorkflowResultItem<object, string>): boolean {
  return item.error !== null || item.result === null;
}

/** Names each failed branch once, in order; the first failure of a branch wins. */
export function workflowFailureDetails(
  items: readonly WorkflowResultItem<object, string>[],
): WorkflowFailureDetails {
  const branches = new Map<string, WorkflowFailureCode>();
  for (const item of items) {
    if (!isFailedResultItem(item) || branches.has(item.workflowType)) continue;
    branches.set(item.workflowType, item.errorCode ?? "ANALYSIS_FAILED");
  }
  return {
    schemaVersion: 1,
    branches: [...branches].map(([branch, errorCode]) => ({ branch, errorCode })),
  };
}

export function isolatedFvpResultItems<
  ContentExtraction extends object,
  FormalCompleteness extends object,
  Plausibility extends object,
  TableOfContents extends object,
>(input: {
  contentExtraction: WorkflowResultItem<
    ContentExtraction,
    typeof WORKFLOW_RESULT_LABELS.contentExtraction
  >;
  formalCompleteness?: WorkflowResultItem<
    FormalCompleteness,
    typeof WORKFLOW_RESULT_LABELS.formalCompleteness
  >;
  plausibility: WorkflowResultItem<Plausibility, typeof WORKFLOW_RESULT_LABELS.plausibility>;
  tableOfContents?: WorkflowResultItem<
    TableOfContents,
    typeof WORKFLOW_RESULT_LABELS.tableOfContents
  >;
}): (
  | WorkflowResultItem<ContentExtraction, typeof WORKFLOW_RESULT_LABELS.contentExtraction>
  | WorkflowResultItem<FormalCompleteness, typeof WORKFLOW_RESULT_LABELS.formalCompleteness>
  | WorkflowResultItem<Plausibility, typeof WORKFLOW_RESULT_LABELS.plausibility>
  | WorkflowResultItem<TableOfContents, typeof WORKFLOW_RESULT_LABELS.tableOfContents>
)[] {
  return [
    input.contentExtraction,
    input.formalCompleteness ?? emptyResultItem(WORKFLOW_RESULT_LABELS.formalCompleteness),
    input.plausibility,
    input.tableOfContents ?? emptyResultItem(WORKFLOW_RESULT_LABELS.tableOfContents),
  ];
}
