import {
  ApplicationFailure,
  type ChildWorkflowOptions,
  executeChild,
  isCancellation,
  log,
  patched,
  proxyActivities,
  sleep as workflowSleep,
  TemporalFailure,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";
import {
  AGENT_ORCHESTRATION_EWMS_ENTRYPOINT_WORKFLOW,
  AGENT_ORCHESTRATION_INSERT_BEWERTUNG_RESULTS_WORKFLOW,
  AGENT_ORCHESTRATION_INSERT_EXTRACTION_RESULTS_WORKFLOW,
  AGENT_ORCHESTRATION_INSERT_RECHTSMETHODIK_RESULTS_WORKFLOW,
  AGENT_ORCHESTRATION_INSERT_SUCHE_ZUORDNUNG_RESULTS_WORKFLOW,
  AGENT_ORCHESTRATION_MVP_WORKFLOW,
  AGENT_ORCHESTRATION_PROCESS_BEWERTUNGEN_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
  type AgentOrchestrationFvpWorkflowOutput,
  BEWERTUNG_TASK_QUEUE,
  BEWERTUNG_WORKFLOW,
  type BewertungsWorkflowInput as BewertungsChildInput,
  type BewertungsWorkflowOutput as BewertungsChildOutput,
  type DmsZipFileProcessingInput,
  type DmsFileProcessingOutput,
  type DMSFileResponse,
  DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW,
  DOCUMENT_MANAGEMENT_TASK_QUEUE,
  EINWENDUNGSMANAGEMENT_ARGUMENT_CLASSIFICATION_WORKFLOW,
  EINWENDUNGSMANAGEMENT_ARGUMENT_EXTRACTION_WORKFLOW,
  EINWENDUNGSMANAGEMENT_TASK_QUEUE,
  FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_MATCHING_WORKFLOW,
  FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW,
  FORMALE_PRUEFUNG_TASK_QUEUE,
  type InhaltsverzeichnisMatchingParams,
  INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW,
  INHALTSEXTRAKTION_PROCESS_DOCUMENTS_EWMS_WORKFLOW,
  INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW,
  INHALTSEXTRAKTION_TASK_QUEUE,
  type EnsureQdrantInput,
  type EnsureQdrantOutput,
  type ProcessedFileInfo,
  type ProcessDocumentsWorkflowInput,
  type ProcessDocumentsWorkflowOutput,
  type LLMMatchingParams,
  type PlausibilityOrchestratorInput,
  type WorkflowName,
  PLAUSIBILITAET_WORKFLOW,
  PLAUSIBILITAET_TASK_QUEUE,
  RECHTSMETHODIK_TASK_QUEUE,
  RECHTSMETHODIK_WORKFLOW,
  type RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  RISIKOHINWEIS_TASK_QUEUE,
  RISIKOHINWEIS_WORKFLOW,
  SUCHE_ZUORDNUNG_SATZ_ORCHESTRATOR_WORKFLOW,
  SUCHE_ZUORDNUNG_TASK_QUEUE,
  type SatzOrchestratorWorkflowInput as SatzChildInput,
  type SatzOrchestratorWorkflowOutput as SatzChildOutput,
  type PFBChapter as PfbChapter,
  type RiskFinderOutput,
} from "@spark-temporal/contracts";
import { type Static, Type } from "@sinclair/typebox";

import {
  NonEmptyStringSchema,
  type BatchInsertExtractionOutput,
  type FileObject,
  type FppRequest,
  type FullFvpWorkflowInput,
  type FvpWorkflowArgs,
  type InsertExtractionResultsInput,
} from "../schemas.ts";
import {
  ASSESSMENT_ACTIVITY_OPTIONS,
  ASSESSMENT_CHILD_OPTIONS,
  type ArgumentClassificationOutput,
  type ArgumentClassificationInput,
  type ArgumentExtractionInput,
  type ArgumentExtractionOutput,
  type BewertungWorkflowInput,
  type EwmsEntrypointInput,
  type EwmsOrchestratorInput,
  type InsertBewertungInput,
  type InsertBewertungOutput,
  type ProcessBewertungenInput,
  type ProcessBewertungenOutput,
  type ProcessDocumentsEwmsInput,
  type ProcessDocumentsEwmsOutput,
  type RisikohinweiseWorkflowInput,
  type WriteBewertungSatzInput,
} from "./assessment-contracts.ts";
import {
  runBewertungWorkflow,
  runEwmsEntrypointWorkflow,
  runEwmsOrchestratorWorkflow,
  runInsertBewertungResultsWorkflow,
  runProcessBewertungenWorkflow,
  runRisikohinweiseWorkflow,
} from "./assessment-logic.ts";
import {
  NORM_ACTIVITY_OPTIONS,
  NORM_CHILD_OPTIONS,
  type CachedNormBatchInput,
  type BatchMvpWorkflowInput,
  type InsertRechtsmethodikResultsInput,
  type InsertRechtsmethodikResultOutput,
  type InsertSuzResultsInput,
  type InsertSuzResultsOutput,
  type MvpWorkflowInput,
  type MvpWorkflowOutput,
  type RechtsmethodikChildInput,
  type SuzWorkflowInput,
  type WriteRechtsmethodikResultInput,
  type WriteSatzFundstellenInput,
} from "./norm-contracts.ts";
import {
  runBatchMvpWorkflow,
  runInsertRechtsmethodikResultsWorkflow,
  runInsertSuzResultsWorkflow,
  runMvpWorkflow,
  runSuzWorkflow,
} from "./norm-logic.ts";
import { extractionEntries } from "./extraction.ts";
import type { AosActivities } from "./registrations.ts";
import {
  ACTIVITY_OPTIONS,
  type ClassificationWorkflowResultItem,
  type DmsWorkflowResultItem,
  type FvpWorkflowResult,
  type WorkflowResultItem,
  WORKFLOW_RESULT_LABELS,
  failedResultItem,
  isFailedResultItem,
  isolatedFvpResultItems,
  settledResultItem,
  workflowFailureDetails,
} from "./workflow-contracts.ts";

const ExistingDocumentSchema = Type.Object(
  {
    id: NonEmptyStringSchema,
    dmsFileId: NonEmptyStringSchema,
    isOutdated: Type.Optional(Type.Boolean()),
    isTocDocument: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);
const ErlaeuterungsberichtResultsSchema = Type.Object(
  {
    matchedDocumentTypes: Type.Array(
      Type.Object(
        {
          requiredDocumentType: Type.Object(
            { documentTypeName: Type.String() },
            { additionalProperties: true },
          ),
          assignedDocuments: Type.Array(
            Type.Object(
              {
                documentId: NonEmptyStringSchema,
                confidence: Type.Optional(Type.Number()),
              },
              { additionalProperties: true },
            ),
          ),
        },
        { additionalProperties: true },
      ),
    ),
  },
  { additionalProperties: true },
);
type ExistingDocument = Static<typeof ExistingDocumentSchema>;

type DefaultActivities = Pick<
  AosActivities,
  | "getProjectFiles"
  | "listFvpProjectFiles"
  | "getTemplateDocumentTypes"
  | "markTocDocument"
  | "getTopics"
  | "updateFileTopics"
> & {
  fetchExistingDokumentNodes(projectId: string): Promise<ExistingDocument[]>;
  getFormalCompletenessResults(
    projectId: string,
  ): Promise<Static<typeof ErlaeuterungsberichtResultsSchema>>;
};
type ResultDeliveryActivities = Pick<
  AosActivities,
  "sendFvpResults" | "sendPlausibilityResults"
> & {
  sendTocMatchingResults(input: { projectId: string; fileId: string }): Promise<{
    tocDocumentId: string;
  }>;
};

const defaultActivities = proxyActivities<DefaultActivities>(ACTIVITY_OPTIONS.default);
const fppDownloadActivities = proxyActivities<Pick<AosActivities, "downloadFppFile">>(
  ACTIVITY_OPTIONS.fppDownload,
);
const resultDeliveryActivities = proxyActivities<ResultDeliveryActivities>(
  ACTIVITY_OPTIONS.resultDelivery,
);
const extractionWriteActivities = proxyActivities<
  Pick<AosActivities, "batchInsertExtractionNodes">
>(ACTIVITY_OPTIONS.extractionWrite);

const mvpCacheReadActivities = proxyActivities<Pick<AosActivities, "getNormDeconstruction">>(
  NORM_ACTIVITY_OPTIONS.mvpCacheRead,
);
const mvpCacheSaveActivities = proxyActivities<Pick<AosActivities, "saveNormDeconstruction">>(
  NORM_ACTIVITY_OPTIONS.mvpCacheSave,
);
const batchNormFetchActivities = proxyActivities<Pick<AosActivities, "fetchProjectNorms">>(
  NORM_ACTIVITY_OPTIONS.batchFetchNorms,
);
const batchCachedNormActivities = proxyActivities<
  Pick<AosActivities, "processCachedNormDeconstructions">
>(NORM_ACTIVITY_OPTIONS.batchCachedNorms);
const rechtsmethodikTopicActivities = proxyActivities<Pick<AosActivities, "fetchPlsTopicNorms">>(
  NORM_ACTIVITY_OPTIONS.rechtsmethodikTopicFetch,
);
const rechtsmethodikContextActivities = proxyActivities<
  Pick<AosActivities, "fetchExaminationRechtsmethodikContext">
>(NORM_ACTIVITY_OPTIONS.rechtsmethodikContextFetch);
const rechtsmethodikWriteActivities = proxyActivities<
  Pick<AosActivities, "insertRechtsmethodikResult">
>(NORM_ACTIVITY_OPTIONS.rechtsmethodikWrite);
const suzDocumentActivities = proxyActivities<Pick<AosActivities, "fetchDocumentNodes">>(
  NORM_ACTIVITY_OPTIONS.suzDocumentFetch,
);
const suzGraphActivities = proxyActivities<
  Pick<AosActivities, "fetchNormData" | "fetchNormExaminationIds">
>(NORM_ACTIVITY_OPTIONS.suzGraphFetch);
const suzResultActivities = proxyActivities<
  Pick<AosActivities, "fetchExistingDokumenteForSuz" | "resolveChunkDokumente" | "writeSatzFundstellen">
>(NORM_ACTIVITY_OPTIONS.suzResultPeer);

const bewertungGatherActivities = proxyActivities<Pick<AosActivities, "gatherNormContext">>(
  ASSESSMENT_ACTIVITY_OPTIONS.bewertungGather,
);
const bewertungSuzActivities = proxyActivities<Pick<AosActivities, "startAndAwaitSuz">>(
  ASSESSMENT_ACTIVITY_OPTIONS.bewertungSuz,
);
const bewertungWriteActivities = proxyActivities<
  Pick<AosActivities, "writeBewertungSatzResult">
>(ASSESSMENT_ACTIVITY_OPTIONS.bewertungWrite);
const ewmsPeerActivities = proxyActivities<
  Pick<
    AosActivities,
    | "_fetch_ewms_documents"
    | "_fetch_processed_file_ids"
    | "_fetch_argument_topics"
    | "_store_extraction_results"
    | "_store_classification_results"
    | "_store_injection_results"
    | "_mark_classification_failed"
  >
>(ASSESSMENT_ACTIVITY_OPTIONS.ewmsPeer);
const riskPeerActivities = proxyActivities<
  Pick<AosActivities, "_fetch_risikohinweis_chapter" | "_replace_vae_node_risks">
>(ASSESSMENT_ACTIVITY_OPTIONS.riskPeer);

interface ChildWorkflows {
  FileProcessingWorkflow: {
    input: DmsZipFileProcessingInput;
    output: DmsFileProcessingOutput;
    taskQueue: typeof DOCUMENT_MANAGEMENT_TASK_QUEUE;
  };
  InsertExtractionResultsWorkflow: {
    input: InsertExtractionResultsInput;
    output: BatchInsertExtractionOutput["results"];
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  "ensure-qdrant-workflow": {
    input: EnsureQdrantInput;
    output: EnsureQdrantOutput;
    taskQueue: typeof INHALTSEXTRAKTION_TASK_QUEUE;
  };
  InhaltsverzeichnisMatchingWorkflow: {
    input: InhaltsverzeichnisMatchingParams;
    output: DMSFileResponse;
    taskQueue: typeof FORMALE_PRUEFUNG_TASK_QUEUE;
  };
  LLMMatchingWorkflow: {
    input: LLMMatchingParams;
    output: DMSFileResponse;
    taskQueue: typeof FORMALE_PRUEFUNG_TASK_QUEUE;
  };
  PlausibilityMainOrchestratorWorkflow: {
    input: PlausibilityOrchestratorInput;
    output: DMSFileResponse;
    taskQueue: typeof PLAUSIBILITAET_TASK_QUEUE;
  };
  "process-documents-workflow": {
    input: ProcessDocumentsWorkflowInput;
    output: ProcessDocumentsWorkflowOutput;
    taskQueue: typeof INHALTSEXTRAKTION_TASK_QUEUE;
  };
  RechtsmethodikWorkflow: {
    input: RechtsmethodikChildInput;
    output: RechtsmethodikResult;
    taskQueue: typeof RECHTSMETHODIK_TASK_QUEUE;
  };
  InsertRechtsmethodikResultsWorkflow: {
    input: InsertRechtsmethodikResultsInput;
    output: InsertRechtsmethodikResultOutput[];
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  MVPWorkflow: {
    input: MvpWorkflowInput;
    output: MvpWorkflowOutput;
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  satz_orchestrator: {
    input: SatzChildInput;
    output: SatzChildOutput;
    taskQueue: typeof SUCHE_ZUORDNUNG_TASK_QUEUE;
  };
  InsertSucheZuordnungResultsWorkflow: {
    input: InsertSuzResultsInput;
    output: InsertSuzResultsOutput;
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  bewertungs_workflow: {
    input: BewertungsChildInput;
    output: BewertungsChildOutput;
    taskQueue: typeof BEWERTUNG_TASK_QUEUE;
  };
  ProcessBewertungenWorkflow: {
    input: ProcessBewertungenInput;
    output: ProcessBewertungenOutput;
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  InsertBewertungResultsWorkflow: {
    input: InsertBewertungInput;
    output: InsertBewertungOutput;
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  EWMSEntrypointWorkflow: {
    input: EwmsEntrypointInput;
    output: Record<string, never>;
    taskQueue: typeof AGENT_ORCHESTRATION_TASK_QUEUE;
  };
  "process-documents-ewms-workflow": {
    input: ProcessDocumentsEwmsInput;
    output: ProcessDocumentsEwmsOutput;
    taskQueue: typeof INHALTSEXTRAKTION_TASK_QUEUE;
  };
  "argument-extraction-workflow": {
    input: ArgumentExtractionInput;
    output: ArgumentExtractionOutput;
    taskQueue: typeof EINWENDUNGSMANAGEMENT_TASK_QUEUE;
  };
  "argument-classification-workflow": {
    input: ArgumentClassificationInput;
    output: ArgumentClassificationOutput;
    taskQueue: typeof EINWENDUNGSMANAGEMENT_TASK_QUEUE;
  };
  RiskCheckerWorkflow: {
    input: PfbChapter;
    output: RiskFinderOutput;
    taskQueue: typeof RISIKOHINWEIS_TASK_QUEUE;
  };
}

type ChildWorkflow<Name extends keyof ChildWorkflows> = (
  input: ChildWorkflows[Name]["input"],
) => Promise<ChildWorkflows[Name]["output"]>;

async function child<Name extends keyof ChildWorkflows>(
  name: WorkflowName<Name>,
  input: ChildWorkflows[Name]["input"],
  taskQueue: ChildWorkflows[Name]["taskQueue"],
  options: Omit<ChildWorkflowOptions, "args" | "taskQueue"> = {
    workflowId: uuid4(),
    workflowTaskTimeout: "60 seconds",
    searchAttributes: workflowInfo().searchAttributes,
  },
): Promise<ChildWorkflows[Name]["output"]> {
  return executeChild<ChildWorkflow<Name>>(name, {
    args: [input],
    taskQueue,
    ...options,
  });
}

async function updateDocumentTopics(files: readonly ProcessedFileInfo[]): Promise<void> {
  const updates = files.flatMap((file) => {
    const metadata = file.processedDocument?.metadata;
    if (metadata?.sourceFileId == null || metadata.documentTopic == null) return [];
    return [{ fileId: metadata.sourceFileId, topicId: metadata.documentTopic.id }];
  });
  for (let offset = 0; offset < updates.length; offset += 10) {
    await Promise.all(
      updates
        .slice(offset, offset + 10)
        .map(({ fileId, topicId }) => defaultActivities.updateFileTopics(fileId, [topicId])),
    );
  }
}

/** Logs the failed branches once for operators and builds the typed run failure. */
function processingRunFailure(
  message: string,
  failed: readonly WorkflowResultItem<object, string>[],
  cause?: Error,
): ApplicationFailure {
  log.error("Processing run failed", {
    workflowId: workflowInfo().workflowId,
    branches: failed.map(({ workflowType, errorCode, error }) => ({
      branch: workflowType,
      errorCode: errorCode ?? "ANALYSIS_FAILED",
      error,
    })),
  });
  return ApplicationFailure.create({
    message,
    type: "ANALYSIS_FAILED",
    nonRetryable: true,
    details: [workflowFailureDetails(failed)],
    cause,
  });
}

function noDocumentsFailure(message: string): ApplicationFailure {
  log.error("Processing run failed", {
    workflowId: workflowInfo().workflowId,
    errorCode: "NO_DOCUMENTS",
    error: message,
  });
  return ApplicationFailure.create({ message, type: "NO_DOCUMENTS", nonRetryable: true });
}

type ContentExtractionFailure = WorkflowResultItem<
  never,
  typeof WORKFLOW_RESULT_LABELS.contentExtraction
>;

interface ContentExtraction {
  result: ProcessDocumentsWorkflowOutput;
  /** Follow-up children that failed after the extraction itself succeeded. */
  failures: ContentExtractionFailure[];
}

async function runContentExtraction(input: FullFvpWorkflowInput): Promise<ContentExtraction> {
  const fileIds = input.incremental ? input.candidateFileIds : input.fileIds;
  if (fileIds.length === 0) throw noDocumentsFailure("No files provided");
  let result: ProcessDocumentsWorkflowOutput;
  try {
    result = await child(
      INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW,
      {
        projectId: input.projectId,
        fileIds: fileIds,
        possibleTopics: input.topics,
      },
      INHALTSEXTRAKTION_TASK_QUEUE,
    );
  } catch (error) {
    if (isCancellation(error)) throw error;
    const reason = error instanceof Error ? error : new Error(String(error));
    throw processingRunFailure(
      `Content extraction failed for project ${input.projectId}`,
      [failedResultItem(WORKFLOW_RESULT_LABELS.contentExtraction, reason)],
      reason,
    );
  }
  const files = result.summaryData.processedFiles;
  const failures: ContentExtractionFailure[] = [];
  try {
    const indexed = await child(
      INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW,
      {
        projectId: input.projectId,
        processedFiles: files,
      },
      INHALTSEXTRAKTION_TASK_QUEUE,
    );
    const processedIds = new Set(indexed.processedIds ?? []);
    const unindexedIds = [
      ...new Set([
        ...(indexed.failedIds ?? []),
        ...files.flatMap(({ processedDocument, processedJsonFileId }) =>
          processedDocument == null || processedIds.has(processedJsonFileId)
            ? []
            : [processedJsonFileId],
        ),
      ]),
    ];
    if (unindexedIds.length > 0) {
      throw new Error(`Document indexing is incomplete for ${unindexedIds.join(", ")}`);
    }
    await child(
      AGENT_ORCHESTRATION_INSERT_EXTRACTION_RESULTS_WORKFLOW,
      {
        projectId: input.projectId,
        processedFiles: files,
        dokumentIdByFileId: input.dokumentIdByFileId,
      },
      AGENT_ORCHESTRATION_TASK_QUEUE,
    );
  } catch (error) {
    if (isCancellation(error)) throw error;
    failures.push(
      failedResultItem(
        WORKFLOW_RESULT_LABELS.contentExtraction,
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }
  await updateDocumentTopics(files);
  return { result, failures };
}

async function runClassification(input: FullFvpWorkflowInput): Promise<{
  items: ClassificationWorkflowResultItem[];
  classificationFileId: string | null;
}> {
  const calls: Array<{
    name:
      | typeof WORKFLOW_RESULT_LABELS.formalCompleteness
      | typeof WORKFLOW_RESULT_LABELS.tableOfContents;
    promise: Promise<DMSFileResponse>;
  }> = [];
  const fileIds = input.incremental ? input.candidateFileIds : input.fileIds;
  if (fileIds.length > 0) {
    calls.push({
      name: WORKFLOW_RESULT_LABELS.formalCompleteness,
      promise: child(
        FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW,
        {
          projectId: input.projectId,
          documentTypes: input.documentTypes,
          documentIds: fileIds,
        },
        FORMALE_PRUEFUNG_TASK_QUEUE,
      ),
    });
  }
  if (!input.hasTocDocument) {
    calls.push({
      name: WORKFLOW_RESULT_LABELS.tableOfContents,
      promise: child(
        FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_MATCHING_WORKFLOW,
        {
          projectId: input.projectId,
          documentTypes: input.documentTypes,
        },
        FORMALE_PRUEFUNG_TASK_QUEUE,
      ),
    });
  }
  const settled = await Promise.allSettled(calls.map(({ promise }) => promise));
  const items: ClassificationWorkflowResultItem[] = settled.map((outcome, index) => {
    const name = calls[index]!.name;
    return name === WORKFLOW_RESULT_LABELS.formalCompleteness
      ? settledResultItem(WORKFLOW_RESULT_LABELS.formalCompleteness, outcome)
      : settledResultItem(WORKFLOW_RESULT_LABELS.tableOfContents, outcome);
  });
  const formal = items.find(
    ({ workflowType }) => workflowType === WORKFLOW_RESULT_LABELS.formalCompleteness,
  );
  return {
    items,
    classificationFileId: formal?.result?.id ?? null,
  };
}

function erlaeuterungsberichtIds(
  results: Static<typeof ErlaeuterungsberichtResultsSchema>,
): string[] {
  const candidates: Array<{ confidence: number; id: string }> = [];
  for (const entry of results.matchedDocumentTypes) {
    if (entry.requiredDocumentType.documentTypeName !== "Erläuterungsbericht") continue;
    for (const document of entry.assignedDocuments) {
      candidates.push({
        id: document.documentId,
        confidence: document.confidence ?? 0,
      });
    }
  }
  candidates.sort((left, right) => right.confidence - left.confidence);
  return candidates[0] === undefined ? [] : [candidates[0].id];
}

async function runPlausibility(
  input: FullFvpWorkflowInput,
  classificationFileId: string | null,
  erlaeuterungsberichtDocumentIds: readonly string[] = [],
  propagateCancellation = false,
): Promise<WorkflowResultItem<DMSFileResponse, typeof WORKFLOW_RESULT_LABELS.plausibility>> {
  const plausibility = await Promise.allSettled([
    child(
      PLAUSIBILITAET_WORKFLOW,
      {
        projectId: input.projectId,
        documentIds: input.fileIds,
        erlaeuterungsberichtDocumentIds: [...erlaeuterungsberichtDocumentIds],
        classificationFileId: classificationFileId,
      },
      PLAUSIBILITAET_TASK_QUEUE,
    ),
  ]);
  return settledResultItem(
    WORKFLOW_RESULT_LABELS.plausibility,
    plausibility[0]!,
    propagateCancellation ? isCancellation : undefined,
  );
}

export async function IsolatedFVPWorkflow(input: FullFvpWorkflowInput): Promise<FvpWorkflowResult> {
  const extraction = await runContentExtraction(input);
  // The result item carries only the first follow-up failure, so operators see every one here.
  for (const failure of extraction.failures) {
    log.error("Content extraction follow-up failed", {
      workflowId: workflowInfo().workflowId,
      branch: failure.workflowType,
      errorCode: failure.errorCode,
      error: failure.error,
    });
  }
  const classification = await runClassification(input);
  const plausibility = await runPlausibility(input, classification.classificationFileId);
  const extractionFailure = extraction.failures[0];
  return {
    results: isolatedFvpResultItems({
      contentExtraction: {
        workflowType: WORKFLOW_RESULT_LABELS.contentExtraction,
        result: extraction.result,
        error: extractionFailure?.error ?? null,
        errorCode: extractionFailure?.errorCode ?? null,
      },
      formalCompleteness: classification.items.find(
        (
          item,
        ): item is WorkflowResultItem<
          DMSFileResponse,
          typeof WORKFLOW_RESULT_LABELS.formalCompleteness
        > => item.workflowType === WORKFLOW_RESULT_LABELS.formalCompleteness,
      ),
      plausibility,
      tableOfContents: classification.items.find(
        (
          item,
        ): item is WorkflowResultItem<
          DMSFileResponse,
          typeof WORKFLOW_RESULT_LABELS.tableOfContents
        > => item.workflowType === WORKFLOW_RESULT_LABELS.tableOfContents,
      ),
    }),
  };
}

export async function FPPDownloadWorkflow(input: FppRequest): Promise<FileObject | null> {
  const file = await fppDownloadActivities.downloadFppFile({
    projectId: input.projectId,
    url: input.file.url,
    fileName: input.file.fileName,
    fileId: input.file.fileId,
    fileType: input.file.fileType,
  });
  if (file !== null && file.filename.toLowerCase().endsWith(".zip")) {
    const projectVersion = workflowInfo().searchAttributes.ProjectVersion?.[0] as
      | number
      | undefined;
    if (projectVersion === undefined) {
      throw ApplicationFailure.nonRetryable("project context not set, has to be set");
    }
    await child(
      DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW,
      {
        fileId: file.id,
        filename: file.filename,
        projectId: input.projectId,
        fileType: "zip",
        zipPath: file.bucketPath,
        entryFileType: "document",
        sourceProjectVersion: projectVersion,
        workflowActor: null,
      },
      DOCUMENT_MANAGEMENT_TASK_QUEUE,
    );
  }
  return file;
}

async function fvpProjectFiles(projectId: string): Promise<FileObject[]> {
  if (patched("185-fvp-project-files-result")) {
    const files = await defaultActivities.listFvpProjectFiles(projectId);
    if (!files.ok) throw noDocumentsFailure(files.failure.message);
    return files.value;
  }
  // Runs started before the patch replay the activity they recorded.
  const files = await defaultActivities.getProjectFiles(projectId);
  if (files.length === 0) {
    throw noDocumentsFailure(`No documents found for project ${projectId}`);
  }
  return files;
}

export async function FVPWorkflow(
  input: FvpWorkflowArgs,
): Promise<AgentOrchestrationFvpWorkflowOutput> {
  const templateTypes = await defaultActivities.getTemplateDocumentTypes(input.projectId);
  const files = await fvpProjectFiles(input.projectId);
  const documents = await defaultActivities.fetchExistingDokumentNodes(input.projectId);
  const currentIds = new Set(files.map(({ id }) => id));
  const documentsByFileId = Object.fromEntries(
    documents.flatMap((document) =>
      currentIds.has(document.dmsFileId) ? [[document.dmsFileId, document]] : [],
    ),
  );
  const projectVersion = workflowInfo().searchAttributes.ProjectVersion?.[0] as
    | number
    | undefined;
  if (projectVersion === undefined) {
    throw ApplicationFailure.nonRetryable("project context not set, has to be set");
  }
  const incremental = projectVersion !== 1;
  const candidates = files
    .map(({ id }) => id)
    .filter(
      (id) => documentsByFileId[id] === undefined || documentsByFileId[id]?.isOutdated === true,
    );
  const candidateFileIds = incremental ? candidates : files.map(({ id }) => id);
  const hasTocDocument =
    incremental &&
    Object.values(documentsByFileId).some(
      ({ isTocDocument, isOutdated }) => isTocDocument === true && isOutdated !== true,
    );
  // The analyses this run starts (as runClassification decides); each leaves once its result is
  // delivered, so a failure outside their own children can name the ones still here.
  const undelivered = new Set<DmsWorkflowResultItem["workflowType"]>([
    ...(candidateFileIds.length > 0 ? [WORKFLOW_RESULT_LABELS.formalCompleteness] : []),
    ...(hasTocDocument ? [] : [WORKFLOW_RESULT_LABELS.tableOfContents]),
    WORKFLOW_RESULT_LABELS.plausibility,
  ]);
  const extractionFailures: ContentExtractionFailure[] = [];
  const items: DmsWorkflowResultItem[] = [];
  const runFailure = (failed: readonly WorkflowResultItem<object, string>[], cause?: Error) =>
    processingRunFailure(
      `FVPWorkflow failed for project ${input.projectId}: ${[...new Set(failed.map(({ workflowType }) => workflowType))].join(", ")} failed`,
      failed,
      cause,
    );
  try {
    const topics = (await defaultActivities.getTopics(input.projectId)).filter(
      ({ parentTopicId }) => parentTopicId === null,
    );
    const fvpInput: FullFvpWorkflowInput = {
      projectId: input.projectId,
      fileIds: files.map(({ id }) => id),
      candidateFileIds,
      dokumentIdByFileId: Object.fromEntries(
        Object.entries(documentsByFileId).map(([fileId, document]) => [fileId, document.id]),
      ),
      hasTocDocument,
      incremental,
      topics: topics.map(({ id, name, description }) => ({
        id,
        name,
        description,
      })),
      documentTypes: templateTypes.map((documentType) => ({
        category: documentType.category,
        documentTypeName: documentType.documentTypeName,
        documentTypeDescription: documentType.documentTypeDescription,
      })),
    };
    if (candidateFileIds.length > 0) {
      extractionFailures.push(...(await runContentExtraction(fvpInput)).failures);
    }

    const classification = await runClassification(fvpInput);
    items.push(...classification.items);
    for (const item of classification.items) {
      if (item.result === null || item.error !== null) continue;
      if (item.workflowType === WORKFLOW_RESULT_LABELS.formalCompleteness) {
        await resultDeliveryActivities.sendFvpResults({
          projectId: fvpInput.projectId,
          fileId: item.result.id,
        });
      } else if (item.workflowType === WORKFLOW_RESULT_LABELS.tableOfContents) {
        const toc = await resultDeliveryActivities.sendTocMatchingResults({
          projectId: item.result.projectId,
          fileId: item.result.id,
        });
        await defaultActivities.markTocDocument(fvpInput.projectId, toc.tocDocumentId);
      }
      undelivered.delete(item.workflowType);
    }
    const storedFormal = await defaultActivities.getFormalCompletenessResults(fvpInput.projectId);
    const plausibility = await runPlausibility(
      fvpInput,
      classification.classificationFileId,
      erlaeuterungsberichtIds(storedFormal),
      true,
    );
    items.push(plausibility);
    if (plausibility.result !== null && plausibility.error === null) {
      await resultDeliveryActivities.sendPlausibilityResults({
        projectId: plausibility.result.projectId,
        fileId: plausibility.result.id,
      });
      undelivered.delete(WORKFLOW_RESULT_LABELS.plausibility);
    }
  } catch (error) {
    // A cancellation keeps the run Canceled, the workflow's own ApplicationFailures keep their
    // code, and an error that is no TemporalFailure must keep failing the workflow task so
    // Temporal retries it. What remains is an activity or child failure outside an analysis child.
    if (
      isCancellation(error) ||
      error instanceof ApplicationFailure ||
      !(error instanceof TemporalFailure)
    ) {
      throw error;
    }
    const failed: WorkflowResultItem<object, string>[] = [
      ...extractionFailures,
      ...items.filter(isFailedResultItem),
    ];
    for (const branch of undelivered) {
      if (failed.some(({ workflowType }) => workflowType === branch)) continue;
      failed.push(failedResultItem(branch, error));
    }
    throw runFailure(failed, error);
  }
  const failed = [...extractionFailures, ...items.filter(isFailedResultItem)];
  if (failed.length > 0) throw runFailure(failed);
  return { checks: items };
}

export async function InsertExtractionResultsWorkflow(input: InsertExtractionResultsInput) {
  const entries = extractionEntries(input.processedFiles, input.dokumentIdByFileId, uuid4);
  if (entries.length === 0) return [];
  const output = await extractionWriteActivities.batchInsertExtractionNodes({
    projectId: input.projectId,
    entries,
  });
  return output.results;
}

export function MVPWorkflow(input: MvpWorkflowInput) {
  const workflowId = workflowInfo().workflowId;
  return runMvpWorkflow(input, {
    workflowId,
    getNormDeconstruction: (input: RechtsmethodikChildInput) =>
      mvpCacheReadActivities.getNormDeconstruction(input),
    runRechtsmethodik: (input: RechtsmethodikChildInput, childId: string) =>
      child(RECHTSMETHODIK_WORKFLOW, input, RECHTSMETHODIK_TASK_QUEUE, {
        workflowId: childId,
        ...NORM_CHILD_OPTIONS.rechtsmethodik,
      }),
    saveNormDeconstruction: (input) => mvpCacheSaveActivities.saveNormDeconstruction(input),
    insertRechtsmethodikResults: (input: InsertRechtsmethodikResultsInput, childId: string) =>
      child(
        AGENT_ORCHESTRATION_INSERT_RECHTSMETHODIK_RESULTS_WORKFLOW,
        input,
        AGENT_ORCHESTRATION_TASK_QUEUE,
        { workflowId: childId },
      ),
  });
}

export function BatchMVPWorkflow(input: BatchMvpWorkflowInput) {
  const workflowId = workflowInfo().workflowId;
  return runBatchMvpWorkflow(input, {
    workflowId,
    fetchProjectNorms: (projectId: string) =>
      batchNormFetchActivities.fetchProjectNorms(projectId),
    processCachedNormDeconstructions: (input: CachedNormBatchInput) =>
      batchCachedNormActivities.processCachedNormDeconstructions(input),
    runMvp: (input: MvpWorkflowInput, childId: string) =>
      child(AGENT_ORCHESTRATION_MVP_WORKFLOW, input, AGENT_ORCHESTRATION_TASK_QUEUE, {
        workflowId: childId,
        ...NORM_CHILD_OPTIONS.batchMvp,
      }),
  });
}

export function InsertRechtsmethodikResultsWorkflow(input: InsertRechtsmethodikResultsInput) {
  return runInsertRechtsmethodikResultsWorkflow(input, {
    newId: uuid4,
    fetchPlsTopicNorms: (projectId: string) =>
      rechtsmethodikTopicActivities.fetchPlsTopicNorms(projectId),
    fetchExaminationContext: (projectId: string) =>
      rechtsmethodikContextActivities.fetchExaminationRechtsmethodikContext(projectId),
    writeResult: (input: WriteRechtsmethodikResultInput) =>
      rechtsmethodikWriteActivities.insertRechtsmethodikResult(input),
    sleep: (duration: string) => workflowSleep(duration),
  });
}

export function suche_zuordnung_norm(input: SuzWorkflowInput) {
  const workflowId = workflowInfo().workflowId;
  return runSuzWorkflow(input, {
    workflowId,
    newId: uuid4,
    fetchNormData: (input) => suzGraphActivities.fetchNormData(input),
    fetchDocumentNodes: (input) => suzDocumentActivities.fetchDocumentNodes(input),
    fetchNormExaminationIds: (input) => suzGraphActivities.fetchNormExaminationIds(input),
    runSatz: (input: SatzChildInput, childId: string) =>
      child(SUCHE_ZUORDNUNG_SATZ_ORCHESTRATOR_WORKFLOW, input, SUCHE_ZUORDNUNG_TASK_QUEUE, {
        workflowId: childId,
        ...NORM_CHILD_OPTIONS.satz,
      }),
    insertResults: (input: InsertSuzResultsInput) =>
      child(
        AGENT_ORCHESTRATION_INSERT_SUCHE_ZUORDNUNG_RESULTS_WORKFLOW,
        input,
        AGENT_ORCHESTRATION_TASK_QUEUE,
        { workflowId: uuid4(), ...NORM_CHILD_OPTIONS.suzInsert },
      ),
  });
}

export function InsertSucheZuordnungResultsWorkflow(input: InsertSuzResultsInput) {
  return runInsertSuzResultsWorkflow(input, {
    newId: uuid4,
    fetchExistingDokumente: (projectId: string) =>
      suzResultActivities.fetchExistingDokumenteForSuz(projectId),
    resolveChunkDokumente: (input) => suzResultActivities.resolveChunkDokumente(input),
    writeSatzFundstellen: (input: WriteSatzFundstellenInput) =>
      suzResultActivities.writeSatzFundstellen(input),
  });
}

export function ProcessBewertungenWorkflow(input: ProcessBewertungenInput) {
  return runProcessBewertungenWorkflow(input, {
    workflowId: workflowInfo().workflowId,
    runChild: (input: BewertungsChildInput, childId: string) =>
      child(BEWERTUNG_WORKFLOW, input, BEWERTUNG_TASK_QUEUE, {
        workflowId: childId,
        ...ASSESSMENT_CHILD_OPTIONS.bewertung,
        searchAttributes: workflowInfo().searchAttributes,
      }),
  });
}

export function InsertBewertungResultsWorkflow(input: InsertBewertungInput) {
  return runInsertBewertungResultsWorkflow(input, {
    newId: uuid4,
    write: (input: WriteBewertungSatzInput) =>
      bewertungWriteActivities.writeBewertungSatzResult(input),
  });
}

export function bewertung(input: BewertungWorkflowInput) {
  return runBewertungWorkflow(input, {
    workflowId: workflowInfo().workflowId,
    gather: (input) => bewertungGatherActivities.gatherNormContext(input),
    startAndAwaitSuz: (input) => bewertungSuzActivities.startAndAwaitSuz(input),
    process: (input, childId) =>
      child(
        AGENT_ORCHESTRATION_PROCESS_BEWERTUNGEN_WORKFLOW,
        input,
        AGENT_ORCHESTRATION_TASK_QUEUE,
        {
          workflowId: childId,
          searchAttributes: workflowInfo().searchAttributes,
        },
      ),
    insert: (input, childId) =>
      child(
        AGENT_ORCHESTRATION_INSERT_BEWERTUNG_RESULTS_WORKFLOW,
        input,
        AGENT_ORCHESTRATION_TASK_QUEUE,
        {
          workflowId: childId,
          searchAttributes: workflowInfo().searchAttributes,
        },
      ),
  });
}

export function EWMSOrchestratorWorkflow(input: EwmsOrchestratorInput) {
  return runEwmsOrchestratorWorkflow(input, {
    workflowId: workflowInfo().workflowId,
    newId: uuid4,
    runEntrypoint: (input: EwmsEntrypointInput, childId: string) =>
      child(AGENT_ORCHESTRATION_EWMS_ENTRYPOINT_WORKFLOW, input, AGENT_ORCHESTRATION_TASK_QUEUE, {
        workflowId: childId,
        ...ASSESSMENT_CHILD_OPTIONS.ewms,
        searchAttributes: workflowInfo().searchAttributes,
      }),
  });
}

export function EWMSEntrypointWorkflow(input: EwmsEntrypointInput) {
  return runEwmsEntrypointWorkflow(input, {
    fetchDocuments: (input) => ewmsPeerActivities._fetch_ewms_documents(input),
    processDocuments: (input) =>
      child(
        INHALTSEXTRAKTION_PROCESS_DOCUMENTS_EWMS_WORKFLOW,
        input,
        INHALTSEXTRAKTION_TASK_QUEUE,
        {
          workflowId: uuid4(),
          ...ASSESSMENT_CHILD_OPTIONS.ewmsDocuments,
          searchAttributes: workflowInfo().searchAttributes,
        },
      ),
    storeInjections: (input) => ewmsPeerActivities._store_injection_results(input),
    extractArguments: (input) =>
      child(
        EINWENDUNGSMANAGEMENT_ARGUMENT_EXTRACTION_WORKFLOW,
        input,
        EINWENDUNGSMANAGEMENT_TASK_QUEUE,
        {
          workflowId: uuid4(),
          ...ASSESSMENT_CHILD_OPTIONS.ewmsArguments,
          searchAttributes: workflowInfo().searchAttributes,
        },
      ),
    storeExtraction: (input) => ewmsPeerActivities._store_extraction_results(input),
    fetchTopics: (projectId) => ewmsPeerActivities._fetch_argument_topics(projectId),
    classifyArguments: (input) =>
      child(
        EINWENDUNGSMANAGEMENT_ARGUMENT_CLASSIFICATION_WORKFLOW,
        input,
        EINWENDUNGSMANAGEMENT_TASK_QUEUE,
        {
          workflowId: uuid4(),
          ...ASSESSMENT_CHILD_OPTIONS.ewmsArguments,
          searchAttributes: workflowInfo().searchAttributes,
        },
      ),
    storeClassification: (input) => ewmsPeerActivities._store_classification_results(input),
    markClassificationFailed: (input) => ewmsPeerActivities._mark_classification_failed(input),
  });
}

export function risikohinweise(input: RisikohinweiseWorkflowInput) {
  return runRisikohinweiseWorkflow(input, {
    fetchChapter: (input) => riskPeerActivities._fetch_risikohinweis_chapter(input),
    runRiskChild: (chapter: PfbChapter) =>
      child(RISIKOHINWEIS_WORKFLOW, chapter, RISIKOHINWEIS_TASK_QUEUE, {
        workflowId: uuid4(),
        searchAttributes: workflowInfo().searchAttributes,
      }),
    replaceRisks: (input) => riskPeerActivities._replace_vae_node_risks(input),
  });
}
