import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
  type WorkflowClient,
  type WorkflowStartOptions,
} from "@temporalio/client";
import type { SearchAttributes } from "@temporalio/common";
import {
  DOCUMENT_MANAGEMENT_FILE_PROCESSING_CANCEL_OPERATION,
  DOCUMENT_MANAGEMENT_FILE_PROCESSING_OPERATION,
  DOCUMENT_MANAGEMENT_PROJECT_VERSION_APPROVAL_OPERATION,
  DocumentManagementFileProcessingCancelTemporalInput,
  DocumentManagementFileProcessingCancelTemporalResult,
  DocumentManagementFileProcessingTemporalInput,
  DocumentManagementFileProcessingTemporalResult,
  DocumentManagementProjectVersionApprovalTemporalInput,
  DocumentManagementProjectVersionApprovalTemporalResult,
  DocumentManagementTemporalError,
  PROJECT_VERSIONING_CREATE_WORKFLOW,
  PROJECT_VERSIONING_TASK_QUEUE,
  type CreateProjectVersionWorkflow,
  type DmsFileProcessingWorkflow,
  type DmsSingleFileProcessingWorkflow,
} from "@spark-temporal/contracts";
import { readTemporalFixture } from "@spark-temporal/typescript/caller";
import {
  runWithProjectContext,
  temporalClientInterceptors,
} from "@spark-temporal/typescript/context";

import type { DocumentCommandConfiguration } from "../env.ts";

interface AcquiredDocumentTemporalCommands {
  readonly connection: Connection;
  readonly workflow: WorkflowClient;
}

export class DocumentTemporalCommandsService {
  private acquisition: Promise<AcquiredDocumentTemporalCommands> | undefined;
  private client: AcquiredDocumentTemporalCommands | undefined;
  private closed = false;

  constructor(private readonly configuration: DocumentCommandConfiguration) {}

  private async acquire(): Promise<AcquiredDocumentTemporalCommands> {
    const connection = await Connection.connect({ address: this.configuration.temporalHost });
    try {
      const workflow = new Client({
        connection,
        namespace: this.configuration.temporalNamespace,
        interceptors: temporalClientInterceptors,
      }).workflow;
      if (this.closed) throw new Error("Document Temporal commands are closed");
      return (this.client = { connection, workflow });
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  private async workflowClient(): Promise<WorkflowClient> {
    if (this.closed) throw new Error("Document Temporal commands are closed");
    const acquisition = (this.acquisition ??= this.acquire());
    try {
      return (await acquisition).workflow;
    } catch (error) {
      if (this.acquisition === acquisition) this.acquisition = undefined;
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const active = this.client;
    this.client = undefined;
    const pending = this.acquisition;
    this.acquisition = undefined;
    if (active !== undefined) {
      await active.connection.close();
      return;
    }
    await pending?.then(
      () => undefined,
      () => undefined,
    );
  }

  async startFileProcessing(input: DocumentManagementFileProcessingTemporalInput) {
    const fixture = readTemporalFixture(DOCUMENT_MANAGEMENT_FILE_PROCESSING_OPERATION, input, {
      input: DocumentManagementFileProcessingTemporalInput,
      result: DocumentManagementFileProcessingTemporalResult,
      error: DocumentManagementTemporalError,
    });
    if (fixture !== undefined) return fixture;

    const { request } = input;
    const workflow = await this.workflowClient();
    const options: Omit<WorkflowStartOptions, "args"> = {
      taskQueue: request.taskQueue,
      workflowId: request.executionId,
      workflowTaskTimeout: "60 seconds",
      workflowIdReusePolicy: request.idReusePolicy,
      workflowIdConflictPolicy: request.idConflictPolicy,
    };
    if (request.projectId !== null || request.projectVersion !== null) {
      const attributes: SearchAttributes = {};
      if (request.projectId !== null) attributes.ProjectId = [request.projectId];
      if (request.projectVersion !== null) attributes.ProjectVersion = [request.projectVersion];
      options.searchAttributes = attributes;
    }
    const start = () =>
      request.kind === "zip"
        ? workflow.start<DmsFileProcessingWorkflow>(request.workflowName, {
            ...options,
            args: [request.workflowInput],
          })
        : workflow.start<DmsSingleFileProcessingWorkflow>(request.workflowName, {
            ...options,
            args: [request.workflowInput],
          });
    const handle = await (
      request.projectId === null || request.projectVersion === null
        ? start()
        : runWithProjectContext(
            { projectId: request.projectId, projectVersion: request.projectVersion },
            start,
          )
    ).catch((error) => {
      if (request.kind !== "zip" || !(error instanceof WorkflowExecutionAlreadyStartedError))
        throw error;
      return workflow.getHandle<DmsFileProcessingWorkflow>(request.executionId);
    });
    const description = await handle.describe();
    const status = description.status.name;
    if (status === "UNSPECIFIED" || status === "PAUSED" || status === "UNKNOWN") {
      throw new TypeError(`Temporal returned unsupported DMS workflow status '${status}'`);
    }
    return {
      workflowId: handle.workflowId,
      runId: description.runId,
      workflowStatus: status === "CANCELLED" ? "CANCELED" : status,
    } satisfies DocumentManagementFileProcessingTemporalResult;
  }

  async executeProjectVersionApproval(
    input: DocumentManagementProjectVersionApprovalTemporalInput,
  ) {
    const fixture = readTemporalFixture(
      DOCUMENT_MANAGEMENT_PROJECT_VERSION_APPROVAL_OPERATION,
      input,
      {
        input: DocumentManagementProjectVersionApprovalTemporalInput,
        result: DocumentManagementProjectVersionApprovalTemporalResult,
        error: DocumentManagementTemporalError,
      },
    );
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    const searchAttributes: SearchAttributes = { ProjectId: [input.projectId] };
    if (input.sourceProjectVersion !== null) {
      searchAttributes.ProjectVersion = [input.sourceProjectVersion];
    }
    const options: WorkflowStartOptions<CreateProjectVersionWorkflow> = {
      taskQueue: PROJECT_VERSIONING_TASK_QUEUE,
      workflowId: input.executionId,
      args: [{ projectId: input.projectId, zipFileId: input.zipFileId }],
      workflowTaskTimeout: "60 seconds",
      workflowIdReusePolicy: input.idReusePolicy,
      workflowIdConflictPolicy: input.idConflictPolicy,
      searchAttributes,
    };
    const start = () =>
      workflow.start<CreateProjectVersionWorkflow>(PROJECT_VERSIONING_CREATE_WORKFLOW, options);
    const handle =
      input.sourceProjectVersion === null
        ? await start()
        : await runWithProjectContext(
            { projectId: input.projectId, projectVersion: input.sourceProjectVersion },
            start,
          );
    const result = await handle.result();
    return { newVersion: result.newVersion ?? null };
  }

  async cancelFileProcessing(input: DocumentManagementFileProcessingCancelTemporalInput) {
    const fixture = readTemporalFixture(
      DOCUMENT_MANAGEMENT_FILE_PROCESSING_CANCEL_OPERATION,
      input,
      {
        input: DocumentManagementFileProcessingCancelTemporalInput,
        result: DocumentManagementFileProcessingCancelTemporalResult,
        error: DocumentManagementTemporalError,
      },
    );
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    await workflow.getHandle(input.workflowId, input.runId).cancel();
    return {
      workflowId: input.workflowId,
      cancelled: true,
    } satisfies DocumentManagementFileProcessingCancelTemporalResult;
  }
}
