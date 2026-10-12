import type { AuthPolicy } from "@spark-workflow/authentification";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { useLogger, type FeatureHttp } from "@spark-workflow/http-host";
import {
  AGENT_ORCHESTRATION_BATCH_MVP_WORKFLOW,
  AGENT_ORCHESTRATION_BEWERTUNG_WORKFLOW,
  AGENT_ORCHESTRATION_FVP_WORKFLOW,
  AGENT_ORCHESTRATION_RISIKOHINWEISE_WORKFLOW,
  AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
} from "@spark-temporal/contracts";
import { runWithProjectContext } from "@spark-temporal/typescript/context";
import { TemporalFixtureDeclaredError } from "@spark-temporal/typescript/caller";
import { Type } from "@sinclair/typebox";

import { agentOrchestrationErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import {
  BewertungRequestSchema,
  BatchMvpRequestSchema,
  CancelWorkflowResponseSchema,
  FppRequestSchema,
  FvpRequestSchema,
  RisikohinweiseRequestSchema,
  SuzRequestSchema,
  UuidSchema,
  WorkflowResponseSchema,
} from "../schemas.ts";
import { workflowId } from "../temporal/workflow-id.ts";
import { AnonymizationBodySchema, executeAnonymizationRequest } from "./anonymization.ts";
import { startWithConflictMapping } from "./workflow-start-conflict.ts";

const uploadPolicy = {
  roles: ["admin", "user", "service"],
} satisfies AuthPolicy;
const executeProjectPolicy = {
  permissions: [
    {
      resource: "project",
      permission: "execute",
      body: "projectId",
    },
  ],
  bypassRoles: ["service"],
} satisfies AuthPolicy;
const formalProjectPolicy = {
  permissions: [
    {
      resource: "project",
      permission: "execute",
      body: "projectId",
    },
  ],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const camelProjectPolicy = {
  permissions: [
    {
      resource: "project",
      permission: "execute",
      body: "projectId",
    },
  ],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const administrativePolicy = {
  roles: ["admin", "service"],
} satisfies AuthPolicy;

export const createRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("agent-orchestration.routes.workflows")
    .model({
      WorkflowResponse: WorkflowResponseSchema,
      CancelWorkflowResponse: CancelWorkflowResponseSchema,
    })
    .group("/workflows", (app) =>
      app
        .post(
          "/anonymisierung",
          async ({ body, commands, auth }) => {
            const result = await executeAnonymizationRequest(
              body,
              (input) => commands.executeAnonymization(input),
              auth.user,
            );
            if (result.isErr()) throw result.error;
            return result.value;
          },
          {
            body: AnonymizationBodySchema,
            parse: "multipart/form-data",
            response: Type.String({ format: "binary" }),
            auth: uploadPolicy,
            commands: true,
            detail: { operationId: "anonymizePdf" },
          },
        )
        .post(
          "/fpp-download",
          async ({ body, fppDownloads }) => {
            const result = await fppDownloads.start(body);
            if (result.isErr()) throw result.error;
            return result.value;
          },
          {
            body: FppRequestSchema,
            response: WorkflowResponseSchema,
            auth: executeProjectPolicy,
            fppDownloads: true,
            detail: { operationId: "startFppDownloadWorkflow" },
          },
        )
        .post(
          "/formale-pruefung",
          async ({ body, projects, commands }) => {
            const latest = await projects.resolveLatestVersion(body.projectId);
            if (latest.isErr()) throw latest.error;
            const projectVersion = latest.value;
            const executionId = workflowId(
              AGENT_ORCHESTRATION_FVP_WORKFLOW,
              body.projectId,
              projectVersion,
            );
            const result = await startWithConflictMapping(() =>
              runWithProjectContext({ projectId: body.projectId, projectVersion }, () =>
                commands.startFvp({
                  workflowName: AGENT_ORCHESTRATION_FVP_WORKFLOW,
                  executionId: executionId,
                  taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
                  projectId: body.projectId,
                  projectVersion: projectVersion,
                  idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
                  idConflictPolicy: "USE_EXISTING",
                  priority: null,
                }),
              ),
            );
            try {
              const updated = await projects.updateStatus(body.projectId, "IN_PROGRESS");
              if (updated.isErr()) throw updated.error;
            } catch (error) {
              useLogger().warn("Project status update failed after FVP start", { error });
            }
            return { parentJobId: result.workflowId };
          },
          {
            body: FvpRequestSchema,
            response: WorkflowResponseSchema,
            auth: formalProjectPolicy,
            projects: true,
            commands: true,
            detail: { operationId: "startFormalCompletenessWorkflow" },
          },
        )
        .post(
          "/suz/:normId",
          async ({ body, params, projects, commands }) => {
            const latest = await projects.resolveLatestVersion(body.projectId);
            if (latest.isErr()) throw latest.error;
            const projectVersion = latest.value;
            const executionId = workflowId(
              AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
              body.projectId,
              projectVersion,
              params.normId,
            );
            const result = await startWithConflictMapping(() =>
              runWithProjectContext({ projectId: body.projectId, projectVersion }, () =>
                commands.startSuz({
                  workflowName: AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
                  executionId: executionId,
                  taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
                  projectId: body.projectId,
                  projectVersion: projectVersion,
                  idReusePolicy: "ALLOW_DUPLICATE",
                  idConflictPolicy: "UNSPECIFIED",
                  priority: {
                    fairnessKey: "priority",
                    fairnessWeight: 2,
                  },
                  normId: params.normId,
                }),
              ),
            );
            return { parentJobId: result.workflowId };
          },
          {
            body: SuzRequestSchema,
            params: Type.Object({ normId: UuidSchema }),
            response: WorkflowResponseSchema,
            auth: camelProjectPolicy,
            projects: true,
            commands: true,
            detail: { operationId: "startSuzNormWorkflow" },
          },
        )
        .post(
          "/mvp",
          async ({ body, projects, commands }) => {
            const latest = await projects.resolveLatestVersion(body.projectId);
            if (latest.isErr()) throw latest.error;
            const projectVersion = latest.value;
            const executionId = `${AGENT_ORCHESTRATION_BATCH_MVP_WORKFLOW}-${body.projectId}`;
            const result = await runWithProjectContext(
              { projectId: body.projectId, projectVersion },
              () =>
                commands.startBatchMvp({
                  workflowName: AGENT_ORCHESTRATION_BATCH_MVP_WORKFLOW,
                  executionId: executionId,
                  taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
                  projectId: body.projectId,
                  projectVersion: projectVersion,
                  idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
                  idConflictPolicy: "USE_EXISTING",
                  priority: null,
                }),
            );
            return { parentJobId: result.workflowId };
          },
          {
            body: BatchMvpRequestSchema,
            response: WorkflowResponseSchema,
            auth: camelProjectPolicy,
            projects: true,
            commands: true,
            detail: { operationId: "startBatchMvpWorkflow" },
          },
        )
        .post(
          "/bewertung",
          async ({ body, projects, commands }) => {
            const latest = await projects.resolveLatestVersion(body.projectId);
            if (latest.isErr()) throw latest.error;
            const projectVersion = latest.value;
            const executionId = workflowId(
              AGENT_ORCHESTRATION_BEWERTUNG_WORKFLOW,
              body.projectId,
              projectVersion,
              body.normId,
            );
            try {
              const result = await runWithProjectContext(
                { projectId: body.projectId, projectVersion },
                () =>
                  commands.startBewertung({
                    workflowName: AGENT_ORCHESTRATION_BEWERTUNG_WORKFLOW,
                    executionId: executionId,
                    taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
                    projectId: body.projectId,
                    projectVersion: projectVersion,
                    idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
                    idConflictPolicy: "USE_EXISTING",
                    priority: {
                      fairnessKey: "priority",
                      fairnessWeight: 2,
                    },
                    normId: body.normId,
                  }),
              );
              return { parentJobId: result.workflowId };
            } catch (error) {
              if (error instanceof WorkflowExecutionAlreadyStartedError) {
                throw agentOrchestrationErrors.WORKFLOW_ALREADY_STARTED({
                  message: error.message,
                  cause: error,
                  internal: { code: 409 },
                });
              }
              if (error instanceof TemporalFixtureDeclaredError) {
                const outcome = error.outcome as {
                  kind?: unknown;
                  code: string | number;
                  message: string;
                };
                if (outcome.kind === "already_started") {
                  throw agentOrchestrationErrors.WORKFLOW_ALREADY_STARTED({
                    message: outcome.message,
                    internal: { code: outcome.code },
                  });
                }
              }
              throw error;
            }
          },
          {
            body: BewertungRequestSchema,
            response: WorkflowResponseSchema,
            auth: camelProjectPolicy,
            projects: true,
            commands: true,
            detail: { operationId: "startBewertungWorkflow" },
          },
        )
        .post(
          "/risikohinweise",
          async ({ body, projects, commands }) => {
            const latest = await projects.resolveLatestVersion(body.projectId);
            if (latest.isErr()) throw latest.error;
            const projectVersion = latest.value;
            const executionId = workflowId(
              AGENT_ORCHESTRATION_RISIKOHINWEISE_WORKFLOW,
              body.projectId,
              projectVersion,
              body.vaeNodeId,
            );
            const result = await runWithProjectContext(
              { projectId: body.projectId, projectVersion },
              () =>
                commands.startRisikohinweise({
                  workflowName: AGENT_ORCHESTRATION_RISIKOHINWEISE_WORKFLOW,
                  executionId: executionId,
                  taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
                  projectId: body.projectId,
                  projectVersion: projectVersion,
                  idReusePolicy: "ALLOW_DUPLICATE",
                  idConflictPolicy: "USE_EXISTING",
                  priority: {
                    fairnessKey: "priority",
                    fairnessWeight: 2,
                  },
                  vaeNodeId: body.vaeNodeId,
                }),
            );
            return { parentJobId: result.workflowId };
          },
          {
            body: RisikohinweiseRequestSchema,
            response: WorkflowResponseSchema,
            auth: camelProjectPolicy,
            projects: true,
            commands: true,
            detail: { operationId: "startRisikohinweiseWorkflow" },
          },
        )
        .post(
          "/cancel/:workflowId",
          async ({ params, commands }) => {
            try {
              const result = await commands.cancelWorkflow({
                workflowId: params.workflowId,
              });
              return { workflowId: result.workflowId };
            } catch (error) {
              const details = { workflowId: params.workflowId };
              throw error instanceof Error
                ? agentOrchestrationErrors.WORKFLOW_CANCEL_FAILED({
                    message: `Failed to stop workflow ${params.workflowId}`,
                    cause: error,
                    internal: details,
                  })
                : agentOrchestrationErrors.WORKFLOW_CANCEL_FAILED({
                    message: `Failed to stop workflow ${params.workflowId}`,
                    internal: details,
                  });
            }
          },
          {
            params: Type.Object({
              workflowId: Type.String({ minLength: 1 }),
            }),
            response: CancelWorkflowResponseSchema,
            auth: administrativePolicy,
            commands: true,
            detail: { operationId: "cancelWorkflow" },
          },
        ),
    );
