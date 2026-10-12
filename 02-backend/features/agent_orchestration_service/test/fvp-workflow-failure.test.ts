import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  AGENT_ORCHESTRATION_INSERT_EXTRACTION_RESULTS_WORKFLOW,
  FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_MATCHING_WORKFLOW,
  FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW,
  INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW,
  INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW,
  PLAUSIBILITAET_WORKFLOW,
} from "@spark-temporal/contracts";
import {
  ActivityFailure,
  ApplicationFailure,
  CancelledFailure,
  ChildWorkflowFailure,
  RetryState,
} from "@temporalio/common";

type Handler = (...args: unknown[]) => Promise<unknown>;

const projectId = "00000000-0000-4000-8000-000000000101";
const fileId = "00000000-0000-4000-8000-000000000201";
const tocFileId = "00000000-0000-4000-8000-000000000202";

let projectVersion = 2;
let activities = new Map<string, Handler>();
let children = new Map<string, Handler>();

const handler = (handlers: ReadonlyMap<string, Handler>, name: string): Handler =>
  handlers.get(name) ?? (() => Promise.reject(new Error(`unexpected call to ${name}`)));

// FVPWorkflow runs outside a worker here, so the SDK calls that need a workflow context are
// replaced; ApplicationFailure, TemporalFailure and isCancellation stay the real ones.
const realWorkflow = { ...(await import("@temporalio/workflow")) };
await mock.module("@temporalio/workflow", () => ({
  ...realWorkflow,
  log: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
  patched: () => true,
  uuid4: () => crypto.randomUUID(),
  workflowInfo: () => ({
    workflowId: "fvp-under-test",
    searchAttributes: { ProjectVersion: [projectVersion] },
  }),
  proxyActivities: () =>
    new Proxy(
      {},
      {
        get:
          (_target, name: string) =>
          (...args: unknown[]) =>
            handler(activities, name)(...args),
      },
    ),
  executeChild: (name: string, options: { args: unknown[] }) =>
    handler(children, name)(...options.args),
}));

const { FVPWorkflow } = await import("../src/temporal/workflows.ts");

const exhaustedActivity = (activityType: string) =>
  new ActivityFailure(
    "Activity task failed",
    activityType,
    "1",
    RetryState.MAXIMUM_ATTEMPTS_REACHED,
    "worker",
    ApplicationFailure.retryable("upstream unavailable"),
  );

async function runFailure(): Promise<unknown> {
  try {
    await FVPWorkflow({ projectId });
  } catch (error) {
    return error;
  }
  throw new Error("FVPWorkflow completed");
}

async function failureDetails(): Promise<unknown> {
  const failure = await runFailure();
  if (!(failure instanceof ApplicationFailure)) throw failure;
  expect(failure.type).toBe("ANALYSIS_FAILED");
  return failure.details?.[0];
}

beforeEach(() => {
  projectVersion = 2;
  // An incremental run with one outdated file and a still-valid table-of-contents document.
  activities = new Map<string, Handler>([
    ["getTemplateDocumentTypes", async () => []],
    ["listFvpProjectFiles", async () => ({ ok: true, value: [{ id: fileId }, { id: tocFileId }] })],
    [
      "fetchExistingDokumentNodes",
      async () => [
        { id: "dokument-1", dmsFileId: fileId, isOutdated: true },
        { id: "dokument-toc", dmsFileId: tocFileId, isTocDocument: true },
      ],
    ],
    ["getTopics", async () => []],
    ["sendFvpResults", async () => ({})],
    ["sendTocMatchingResults", async () => ({ tocDocumentId: "dokument-toc" })],
    ["markTocDocument", async () => undefined],
  ]);
  children = new Map<string, Handler>([
    [
      INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW,
      async () => ({ summaryData: { processedFiles: [] } }),
    ],
    [AGENT_ORCHESTRATION_INSERT_EXTRACTION_RESULTS_WORKFLOW, async () => []],
    [INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW, async () => ({})],
    [FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW, async () => ({ id: "formal-result", projectId })],
    [
      FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_MATCHING_WORKFLOW,
      async () => ({ id: "toc-result", projectId }),
    ],
  ]);
});

describe("FVPWorkflow failure attribution", () => {
  test("a failed formal-completeness delivery names that branch and the unstarted plausibility", async () => {
    activities.set("sendFvpResults", () => Promise.reject(exhaustedActivity("sendFvpResults")));

    expect(await failureDetails()).toEqual({
      schemaVersion: 1,
      branches: [
        { branch: "formalpruefung", errorCode: "ANALYSIS_FAILED" },
        { branch: "plausibilitaetspruefung", errorCode: "ANALYSIS_FAILED" },
      ],
    });
  });

  test("a failed table-of-contents marking leaves the delivered formal completeness out", async () => {
    projectVersion = 1;
    activities.set("markTocDocument", () => Promise.reject(exhaustedActivity("markTocDocument")));

    expect(await failureDetails()).toEqual({
      schemaVersion: 1,
      branches: [
        { branch: "inhaltsverzeichnismatching", errorCode: "ANALYSIS_FAILED" },
        { branch: "plausibilitaetspruefung", errorCode: "ANALYSIS_FAILED" },
      ],
    });
  });

  test("a failed content extraction keeps its own single branch", async () => {
    children.set(INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW, () =>
      Promise.reject(
        new ChildWorkflowFailure(
          "default",
          { workflowId: "child", runId: "run" },
          INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW,
          RetryState.NON_RETRYABLE_FAILURE,
          ApplicationFailure.nonRetryable("extraction broke"),
        ),
      ),
    );

    expect(await failureDetails()).toEqual({
      schemaVersion: 1,
      branches: [{ branch: "inhaltsextraktion", errorCode: "ANALYSIS_FAILED" }],
    });
  });

  test("a cancelled delivery stays the cancellation", async () => {
    const cancellation = new ActivityFailure(
      "Activity cancelled",
      "sendFvpResults",
      "1",
      RetryState.CANCEL_REQUESTED,
      "worker",
      new CancelledFailure("cancelled"),
    );
    activities.set("sendFvpResults", () => Promise.reject(cancellation));

    expect(await runFailure()).toBe(cancellation);
  });
});

describe("FVPWorkflow extraction completeness", () => {
  const extractionId = "00000000-0000-4000-8000-000000000301";
  const processedFile = {
    sourceFileId: fileId,
    processedJsonFileId: extractionId,
    documentName: "report.pdf",
    documentPath: "report.pdf",
    processedDocument: {
      metadata: {
        documentId: extractionId,
        originalDocumentName: "report.pdf",
        projectId,
        sourceFileId: fileId,
        summary: "report",
      },
      markdownContent: "report",
      chunks: [],
    },
  };
  let calls: string[];

  beforeEach(() => {
    calls = [];
    children.set(INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW, async () => ({
      summaryData: { processedFiles: [processedFile] },
    }));
    children.set(AGENT_ORCHESTRATION_INSERT_EXTRACTION_RESULTS_WORKFLOW, async () => {
      calls.push("insert");
      return [];
    });
    activities.set("sendPlausibilityResults", async () => ({}));
    activities.set("getFormalCompletenessResults", async () => ({ matchedDocumentTypes: [] }));
    children.set(PLAUSIBILITAET_WORKFLOW, async () => ({ id: "plausibility", projectId }));
  });

  test.each([{ processedIds: [], failedIds: [extractionId] }, { alreadyIndexed: true }])(
    "keeps a document outdated while its index is incomplete: %o",
    async (indexed) => {
      children.set(INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW, async () => {
        calls.push("index");
        return indexed;
      });

      expect(await failureDetails()).toEqual({
        schemaVersion: 1,
        branches: [{ branch: "inhaltsextraktion", errorCode: "ANALYSIS_FAILED" }],
      });
      expect(calls).toEqual(["index"]);
    },
  );

  test("stores the extraction only after its document is indexed", async () => {
    children.set(INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW, async () => {
      calls.push("index");
      return { indexedNow: true, processedIds: [extractionId], failedIds: [] };
    });

    await FVPWorkflow({ projectId });

    expect(calls).toEqual(["index", "insert"]);
  });

  test("matches the table of contents again when the stored one is outdated", async () => {
    activities.set("fetchExistingDokumentNodes", async () => [
      { id: "dokument-1", dmsFileId: fileId, isOutdated: true, isTocDocument: true },
    ]);
    children.set(INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW, async () => ({
      processedIds: [extractionId],
    }));
    children.set(FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_MATCHING_WORKFLOW, async () => {
      calls.push("toc");
      return { id: "toc-result", projectId };
    });

    await FVPWorkflow({ projectId });

    expect(calls).toContain("toc");
  });
});
