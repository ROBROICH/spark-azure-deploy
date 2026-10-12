import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
  type WorkflowClient,
} from "@temporalio/client";
import {
  PROJECT_DELETION_TEMPORAL_OPERATION,
  PROJECT_DELETION_TASK_QUEUE,
  PROJECT_DELETION_WORKFLOW,
  PROJECT_INITIALIZATION_TEMPORAL_OPERATION,
  PROJECT_INITIALIZATION_TASK_QUEUE,
  PROJECT_INITIALIZATION_WORKFLOW,
  ProjectDeletionTemporalError,
  ProjectDeletionTemporalInput,
  ProjectDeletionTemporalResult,
  ProjectInitializationTemporalError,
  ProjectInitializationTemporalInput,
  ProjectInitializationTemporalResult,
  type Static,
} from "@spark-temporal/contracts";
import { readTemporalFixture } from "@spark-temporal/typescript/caller";
import {
  runWithProjectContext,
  temporalClientInterceptors,
} from "@spark-temporal/typescript/context";

import type { ProjectCommandConfiguration } from "../env.ts";
import type { DeleteProjectWorkflow, ProjectInitializationWorkflow } from "./workflow-adapter.ts";

interface AcquiredProjectTemporalCommands {
  readonly connection: Connection;
  readonly workflow: WorkflowClient;
}

export class ProjectTemporalCommandsService {
  private acquisition: Promise<AcquiredProjectTemporalCommands> | undefined;
  private client: AcquiredProjectTemporalCommands | undefined;
  private closed = false;

  constructor(private readonly configuration: ProjectCommandConfiguration) {}

  private async acquire(): Promise<AcquiredProjectTemporalCommands> {
    const connection = await Connection.connect({ address: this.configuration.temporalHost });
    try {
      const workflow = new Client({
        connection,
        namespace: this.configuration.temporalNamespace,
        interceptors: temporalClientInterceptors,
      }).workflow;
      if (this.closed) throw new Error("Project Temporal commands are closed");
      return (this.client = { connection, workflow });
    } catch (error) {
      await connection.close();
      throw error;
    }
  }

  private async workflowClient(): Promise<WorkflowClient> {
    if (this.closed) throw new Error("Project Temporal commands are closed");
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

  async initializeProject(input: {
    projectId: string;
    projectTypeId: string;
    projectVersion: number;
  }) {
    const temporalInput = {
      workflowName: PROJECT_INITIALIZATION_WORKFLOW,
      executionId: `ProjectInitializationWorkflow-${input.projectId}-v${input.projectVersion}`,
      taskQueue: PROJECT_INITIALIZATION_TASK_QUEUE,
      projectId: input.projectId,
      projectTypeId: input.projectTypeId,
      projectVersion: input.projectVersion,
      idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
      idConflictPolicy: "FAIL",
    } satisfies ProjectInitializationTemporalInput;
    const fixture = readTemporalFixture(PROJECT_INITIALIZATION_TEMPORAL_OPERATION, temporalInput, {
      input: ProjectInitializationTemporalInput,
      result: ProjectInitializationTemporalResult,
      error: ProjectInitializationTemporalError,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    let disposition: "started" | "already_started" = "started";
    let handle: ReturnType<typeof workflow.getHandle>;
    try {
      handle = await runWithProjectContext(
        { projectId: temporalInput.projectId, projectVersion: temporalInput.projectVersion },
        () =>
          workflow.start<typeof ProjectInitializationWorkflow>(PROJECT_INITIALIZATION_WORKFLOW, {
            taskQueue: PROJECT_INITIALIZATION_TASK_QUEUE,
            workflowId: temporalInput.executionId,
            args: [
              {
                projectId: temporalInput.projectId,
                projectTypeId: temporalInput.projectTypeId,
                projectVersion: temporalInput.projectVersion,
              },
            ],
            workflowIdReusePolicy: temporalInput.idReusePolicy,
            workflowIdConflictPolicy: temporalInput.idConflictPolicy,
            searchAttributes: {
              ProjectId: [temporalInput.projectId],
              ProjectVersion: [temporalInput.projectVersion],
            },
          }),
      );
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      disposition = "already_started";
      handle = workflow.getHandle(temporalInput.executionId);
    }
    const workflowStatus = (await handle.describe()).status.name;
    if (
      workflowStatus === "UNSPECIFIED" ||
      workflowStatus === "PAUSED" ||
      workflowStatus === "UNKNOWN"
    ) {
      throw new TypeError(
        `Temporal returned unsupported Project Logic workflow status '${workflowStatus}'`,
      );
    }
    return {
      disposition,
      workflowStatus: workflowStatus === "CANCELLED" ? "CANCELED" : workflowStatus,
    } satisfies ProjectInitializationTemporalResult;
  }

  async deleteProject(input: {
    projectId: string;
    projectVersion: number;
    workflowActor: Static<typeof ProjectDeletionTemporalInput>["workflowActor"];
  }) {
    const temporalInput = {
      workflowName: PROJECT_DELETION_WORKFLOW,
      executionId: `DeleteProjectWorkflow-${input.projectId}-v${input.projectVersion}`,
      taskQueue: PROJECT_DELETION_TASK_QUEUE,
      projectId: input.projectId,
      projectVersion: input.projectVersion,
      idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
      idConflictPolicy: "USE_EXISTING",
      workflowActor: input.workflowActor,
    } satisfies ProjectDeletionTemporalInput;
    const fixture = readTemporalFixture(PROJECT_DELETION_TEMPORAL_OPERATION, temporalInput, {
      input: ProjectDeletionTemporalInput,
      result: ProjectDeletionTemporalResult,
      error: ProjectDeletionTemporalError,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    await runWithProjectContext(
      { projectId: temporalInput.projectId, projectVersion: temporalInput.projectVersion },
      () =>
        workflow.start<typeof DeleteProjectWorkflow>(PROJECT_DELETION_WORKFLOW, {
          taskQueue: PROJECT_DELETION_TASK_QUEUE,
          workflowId: temporalInput.executionId,
          args: [
            {
              projectId: temporalInput.projectId,
              projectVersion: temporalInput.projectVersion,
              workflowActor: temporalInput.workflowActor,
            },
          ],
          workflowIdReusePolicy: temporalInput.idReusePolicy,
          workflowIdConflictPolicy: temporalInput.idConflictPolicy,
          searchAttributes: {
            ProjectId: [temporalInput.projectId],
            ProjectVersion: [temporalInput.projectVersion],
          },
        }),
    );
    return { started: true } satisfies ProjectDeletionTemporalResult;
  }
}
