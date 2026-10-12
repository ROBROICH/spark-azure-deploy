import { expect, test } from "bun:test";

import {
  CategorizedDocumentTypeInput,
  DOCUMENT_MANAGEMENT_SINGLE_FILE_PROCESSING_WORKFLOW,
  DocumentTypeInput,
  PROJECT_DELETION_WORKFLOW,
  PROJECT_INITIALIZATION_WORKFLOW,
  type ArgumentClassificationOutput,
  type ArgumentClassificationParams,
  type DocumentManagementFileProcessingTemporalInput,
  type ProjectDeletionTemporalInput,
  type ProjectInitializationTemporalInput,
  type TemporalWorkerConfig,
  type TemporalWorkflowContext,
  type WorkflowStatusEvent,
  Value,
} from "../src/index.js";

const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const segment = { text: "text", span: { startIdx: 0, endIdx: 4 } };

test("validates the shared workflow inputs and outputs", () => {
  const record = {
    argumentId: uuid,
    extractedArgument: { argument: segment, description: "description", context: segment },
  };
  const topic = { topicId: uuid, name: "topic", description: "description", subtopics: [] };

  const params: ArgumentClassificationParams = {
    argumentRecords: [record],
    topics: [topic],
  };
  const output: ArgumentClassificationOutput = {
    classifiedArguments: [
      {
        argumentRecord: record,
        topic,
        subtopic: null,
        reasoning: "reason",
        confidence: 0.8,
        topicConfidence: 0.8,
        subtopicConfidence: null,
      },
    ],
  };
  const fileProcessing: DocumentManagementFileProcessingTemporalInput = {
    request: {
      kind: "single_file",
      workflowName: DOCUMENT_MANAGEMENT_SINGLE_FILE_PROCESSING_WORKFLOW,
      executionId: "single-file",
      taskQueue: "dms",
      projectId: null,
      projectVersion: null,
      idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
      idConflictPolicy: "USE_EXISTING",
      workflowInput: {
        fileId: uuid,
        bucketPath: "documents/file.pdf",
        filename: "file.pdf",
        fileType: "document",
        projectId: null,
        workflowActor: null,
      },
    },
  };
  const deletion: ProjectDeletionTemporalInput = {
    workflowName: PROJECT_DELETION_WORKFLOW,
    executionId: "delete-project",
    taskQueue: "project_logic_service",
    projectId: uuid,
    projectVersion: 1,
    idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
    idConflictPolicy: "USE_EXISTING",
    workflowActor: null,
  };
  const initialization: ProjectInitializationTemporalInput = {
    workflowName: PROJECT_INITIALIZATION_WORKFLOW,
    executionId: "initialize-project",
    taskQueue: "project_logic_service",
    projectId: uuid,
    projectTypeId: uuid,
    projectVersion: 1,
    idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
    idConflictPolicy: "FAIL",
  };

  void params;
  void output;
  void fileProcessing;
  void deletion;
  void initialization;
});

test("validates worker context and status values", () => {
  const workerConfig: TemporalWorkerConfig = {
    targetHost: "temporal:7233",
    taskQueue: "worker",
  };
  const workflowContext: TemporalWorkflowContext = {
    audit: {
      actorUserId: null,
      triggeredByUserId: null,
      workflowRunId: null,
      workflowType: null,
      requestStartTime: null,
      requestId: null,
    },
    project: { projectId: uuid, projectVersion: 1 },
  };
  const statusEvent: WorkflowStatusEvent = {
    workflowId: "workflow",
    runId: "run",
    workflowType: "Workflow",
    status: "completed",
    timestamp: "2026-08-17T10:00:00Z",
  };

  void workerConfig;
  void workflowContext;
  void statusEvent;
});

test("document type input accepts document type definitions and ignores unknown properties", () => {
  const canonical = [
    {
      category: null,
      documentTypeName: "Erläuterungsbericht",
      documentTypeDescription: "Beschreibung",
      upstreamMetadata: "ignored",
    },
  ];

  expect(Value.Check(DocumentTypeInput, canonical)).toBe(true);
  expect(
    Value.Check(DocumentTypeInput, [
      { category: null, documentTypeName: "", documentTypeDescription: "Beschreibung" },
    ]),
  ).toBe(true);
});

test("categorized document type input requires the category", () => {
  expect(
    Value.Check(CategorizedDocumentTypeInput, [
      { documentTypeName: "Erläuterungsbericht", documentTypeDescription: "Beschreibung" },
    ]),
  ).toBe(false);
});
