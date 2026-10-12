import { createHash } from "node:crypto";
import { agentOrchestrationErrors } from "../errors.ts";
import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
  type WorkflowClient,
  type WorkflowStartOptions,
} from "@temporalio/client";
import { type DataConverter, type Workflow, type WorkflowIdReusePolicy } from "@temporalio/common";
import {
  AGENT_ORCHESTRATION_BATCH_MVP_WORKFLOW,
  AGENT_ORCHESTRATION_BEWERTUNG_WORKFLOW,
  AGENT_ORCHESTRATION_FPP_DOWNLOAD_WORKFLOW,
  AGENT_ORCHESTRATION_FVP_WORKFLOW,
  AGENT_ORCHESTRATION_RISIKOHINWEISE_WORKFLOW,
  AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
  ANONYMISIERUNG_TASK_QUEUE,
  ANONYMISIERUNG_WORKFLOW,
} from "@spark-temporal/contracts";
import { readTemporalFixture } from "@spark-temporal/typescript/caller";
import { temporalClientInterceptors } from "@spark-temporal/typescript/context";
import { createS3PayloadCodec } from "@spark-temporal/typescript/s3-payload-codec";

import type { AosCommandConfiguration } from "../env.ts";
import {
  AnonymizationCommandInputSchema,
  AnonymizationResultSchema,
  BatchMvpCommandInputSchema,
  BewertungCommandInputSchema,
  CancelCommandInputSchema,
  FppCommandInputSchema,
  FvpCommandInputSchema,
  RisikohinweiseCommandInputSchema,
  SuzCommandInputSchema,
  TemporalCommandErrorSchema,
  WorkflowStartResultSchema,
  type AnonymizationCommandInput,
  type AnonymizationResult,
  type BatchMvpCommandInput,
  type BewertungCommandInput,
  type CancelCommandInput,
  type FppCommandInput,
  type FvpCommandInput,
  type RisikohinweiseCommandInput,
  type SuzCommandInput,
} from "../schemas.ts";
import type { SuzAwaitInput } from "./assessment-contracts.ts";
import type {
  BatchMVPWorkflow,
  FPPDownloadWorkflow,
  FVPWorkflow,
  bewertung,
  risikohinweise,
  suche_zuordnung_norm,
} from "./workflows.ts";

type AnonymizationWorkflow = (input: Uint8Array) => Promise<Uint8Array>;
interface CommandStartInput {
  executionId: string;
  idReusePolicy: WorkflowIdReusePolicy;
  idConflictPolicy: "UNSPECIFIED" | "USE_EXISTING";
  priority: { fairnessKey: string; fairnessWeight: number } | null;
  projectId?: string;
  projectVersion?: number;
}

function startOptions<WorkflowFunction extends Workflow>(
  input: CommandStartInput,
  taskQueue: string,
  args: Parameters<WorkflowFunction>,
): WorkflowStartOptions<WorkflowFunction>;
function startOptions(
  input: CommandStartInput,
  taskQueue: string,
  args: unknown[],
): WorkflowStartOptions {
  const options: WorkflowStartOptions = {
    taskQueue,
    workflowId: input.executionId,
    args,
    workflowIdReusePolicy: input.idReusePolicy,
  };
  if (input.idConflictPolicy !== "UNSPECIFIED") {
    options.workflowIdConflictPolicy = input.idConflictPolicy;
  }
  if (input.priority !== null) {
    options.priority = {
      fairnessKey: input.priority.fairnessKey,
      fairnessWeight: input.priority.fairnessWeight,
    };
  }
  if (input.projectId !== undefined && input.projectVersion !== undefined) {
    options.searchAttributes = {
      ProjectId: [input.projectId],
      ProjectVersion: [input.projectVersion],
    };
  }
  return options;
}

const workflowContracts = {
  result: WorkflowStartResultSchema,
  error: TemporalCommandErrorSchema,
};

interface AcquiredTemporalCommands {
  readonly connection: Connection;
  readonly codec: ReturnType<typeof createS3PayloadCodec> | undefined;
  readonly workflow: WorkflowClient;
}

async function closeTemporalCommands(
  client: Pick<AcquiredTemporalCommands, "connection" | "codec">,
): Promise<void> {
  const results = await Promise.allSettled([client.connection.close(), client.codec?.close()]);
  const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length > 0) throw new AggregateError(errors, "Failed to close AOS Temporal commands");
}

export class AosTemporalCommandsService {
  private acquisition: Promise<AcquiredTemporalCommands> | undefined;
  private client: AcquiredTemporalCommands | undefined;
  private closed = false;

  constructor(private readonly configuration: AosCommandConfiguration) {}

  private async acquire(): Promise<AcquiredTemporalCommands> {
    const connection = await Connection.connect({ address: this.configuration.temporalHost });
    let codec: ReturnType<typeof createS3PayloadCodec> | undefined;
    try {
      codec =
        this.configuration.payloadStorage === null
          ? undefined
          : createS3PayloadCodec(this.configuration.payloadStorage);
      const dataConverter: DataConverter | undefined =
        codec === undefined ? undefined : { payloadCodecs: [codec] };
      const workflow = new Client({
        connection,
        namespace: this.configuration.temporalNamespace,
        dataConverter,
        interceptors: temporalClientInterceptors,
      }).workflow;
      if (this.closed) throw new Error("AOS Temporal commands are closed");
      return (this.client = { connection, codec, workflow });
    } catch (error) {
      await closeTemporalCommands({ connection, codec });
      throw error;
    }
  }

  private async workflowClient(): Promise<WorkflowClient> {
    if (this.closed) throw new Error("AOS Temporal commands are closed");
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
      await closeTemporalCommands(active);
      return;
    }
    await pending?.then(
      () => undefined,
      () => undefined,
    );
  }

  async executeAnonymization(input: AnonymizationCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.anonymization.execute", input, {
      input: AnonymizationCommandInputSchema,
      result: AnonymizationResultSchema,
      error: TemporalCommandErrorSchema,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    const checksum =
      input.pdfBase64 === undefined
        ? undefined
        : createHash("sha256").update(Buffer.from(input.pdfBase64, "base64")).digest("hex");
    if (input.pdfBase64 !== undefined) {
      try {
        await workflow.start<AnonymizationWorkflow>(ANONYMISIERUNG_WORKFLOW, {
          ...startOptions<AnonymizationWorkflow>(input, ANONYMISIERUNG_TASK_QUEUE, [
            Uint8Array.from(Buffer.from(input.pdfBase64, "base64")),
          ]),
          memo: { anonymizationFileSha256: checksum },
        });
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      }
    }
    const handle = workflow.getHandle<AnonymizationWorkflow>(input.executionId);
    let description;
    try {
      description = await handle.describe();
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) throw error;
      throw agentOrchestrationErrors.ANONYMIZATION_NOT_FOUND({
        internal: { requestId: input.requestId },
      });
    }
    if (checksum !== undefined && description.memo?.anonymizationFileSha256 !== checksum) {
      throw agentOrchestrationErrors.ANONYMIZATION_UPLOAD_CONFLICT({
        internal: { requestId: input.requestId },
      });
    }
    const result = await handle.result();
    return {
      pdfBase64: Buffer.from(result).toString("base64"),
      mediaType: "application/pdf",
    } satisfies AnonymizationResult;
  }

  async startFppDownload(input: FppCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.fpp.start", input, {
      input: FppCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    try {
      const handle = await workflow.start<typeof FPPDownloadWorkflow>(
        AGENT_ORCHESTRATION_FPP_DOWNLOAD_WORKFLOW,
        startOptions<typeof FPPDownloadWorkflow>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
          { projectId: input.projectId, file: input.file },
        ]),
      );
      return { workflowId: handle.workflowId };
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      return { workflowId: input.executionId };
    }
  }

  async startFvp(input: FvpCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.fvp.start", input, {
      input: FvpCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    const handle = await workflow.start<typeof FVPWorkflow>(
      AGENT_ORCHESTRATION_FVP_WORKFLOW,
      startOptions<typeof FVPWorkflow>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
        { projectId: input.projectId },
      ]),
    );
    return { workflowId: handle.workflowId };
  }

  async startSuz(input: SuzCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.suz-norm.start", input, {
      input: SuzCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    const handle = await workflow.start<typeof suche_zuordnung_norm>(
      AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
      startOptions<typeof suche_zuordnung_norm>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
        { projectId: input.projectId, normId: input.normId },
      ]),
    );
    return { workflowId: handle.workflowId };
  }

  async startBatchMvp(input: BatchMvpCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.batch-mvp.start-or-attach", input, {
      input: BatchMvpCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    try {
      const handle = await workflow.start<typeof BatchMVPWorkflow>(
        AGENT_ORCHESTRATION_BATCH_MVP_WORKFLOW,
        startOptions<typeof BatchMVPWorkflow>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
          { projectId: input.projectId },
        ]),
      );
      return { workflowId: handle.workflowId };
    } catch (error) {
      if (error instanceof WorkflowExecutionAlreadyStartedError) {
        return { workflowId: error.workflowId };
      }
      throw error;
    }
  }

  async startBewertung(input: BewertungCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.bewertung.start", input, {
      input: BewertungCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    const handle = await workflow.start<typeof bewertung>(
      AGENT_ORCHESTRATION_BEWERTUNG_WORKFLOW,
      startOptions<typeof bewertung>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
        { projectId: input.projectId, normId: input.normId },
      ]),
    );
    return { workflowId: handle.workflowId };
  }

  async startRisikohinweise(input: RisikohinweiseCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.risikohinweise.start", input, {
      input: RisikohinweiseCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    const handle = await workflow.start<typeof risikohinweise>(
      AGENT_ORCHESTRATION_RISIKOHINWEISE_WORKFLOW,
      startOptions<typeof risikohinweise>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
        { projectId: input.projectId, vaeNodeId: input.vaeNodeId },
      ]),
    );
    return { workflowId: handle.workflowId };
  }

  async cancelWorkflow(input: CancelCommandInput) {
    const fixture = readTemporalFixture("agent-orchestration.workflow.cancel", input, {
      input: CancelCommandInputSchema,
      ...workflowContracts,
    });
    if (fixture !== undefined) return fixture;

    const workflow = await this.workflowClient();
    await workflow.getHandle(input.workflowId).cancel();
    return { workflowId: input.workflowId };
  }

  async startAndAwaitSuz(input: SuzAwaitInput) {
    const workflow = await this.workflowClient();
    const handle = await workflow.start<typeof suche_zuordnung_norm>(
      AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
      startOptions<typeof suche_zuordnung_norm>(input, AGENT_ORCHESTRATION_TASK_QUEUE, [
        { projectId: input.projectId, normId: input.normId },
      ]),
    );
    await handle.result();
    return { completed: true };
  }
}
