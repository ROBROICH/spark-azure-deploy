import { Client, Connection } from "@temporalio/client";
import {
  SearchAttributeType,
  TypedSearchAttributes,
  defineSearchAttributeKey,
  type SearchAttributePair,
} from "@temporalio/common";
import {
  AGENT_ORCHESTRATION_FVP_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
  type AgentOrchestrationFvpWorkflow,
} from "@spark-temporal/contracts";
import {
  runWithProjectContext,
  temporalClientInterceptors,
} from "@spark-temporal/typescript/context";

const projectIdSearchAttribute = defineSearchAttributeKey("ProjectId", SearchAttributeType.KEYWORD);
const projectVersionSearchAttribute = defineSearchAttributeKey(
  "ProjectVersion",
  SearchAttributeType.INT,
);

export interface RunningWorkflow {
  readonly workflowId: string;
  readonly runId: string;
}

export interface ProjectLogicTemporalAdmin {
  listRunning(query: string): AsyncIterable<RunningWorkflow>;
  cancel(workflowId: string, runId: string): Promise<void>;
  startFvp(projectId: string, projectVersion: number): Promise<string>;
  close(): Promise<void>;
}

export async function createProjectLogicTemporalAdmin(input: {
  readonly targetHost: string;
  readonly namespace: string;
}): Promise<ProjectLogicTemporalAdmin> {
  const connection = await Connection.connect({ address: input.targetHost });
  const client = new Client({
    connection,
    namespace: input.namespace,
    interceptors: temporalClientInterceptors,
  });
  return {
    async *listRunning(query) {
      for await (const execution of client.workflow.list({ query })) {
        yield { workflowId: execution.workflowId, runId: execution.runId };
      }
    },
    async cancel(workflowId, runId) {
      await client.workflow.getHandle(workflowId, runId).cancel();
    },
    async startFvp(projectId, projectVersion) {
      const searchAttributes: SearchAttributePair[] = [
        { key: projectIdSearchAttribute, value: projectId },
        { key: projectVersionSearchAttribute, value: projectVersion },
      ];
      const handle = await runWithProjectContext({ projectId, projectVersion }, () =>
        client.workflow.start<AgentOrchestrationFvpWorkflow>(AGENT_ORCHESTRATION_FVP_WORKFLOW, {
          args: [{ projectId: projectId }],
          taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
          workflowId: `${AGENT_ORCHESTRATION_FVP_WORKFLOW}-${projectId}-v${projectVersion}`,
          typedSearchAttributes: new TypedSearchAttributes(searchAttributes),
          workflowTaskTimeout: 60_000,
          workflowIdReusePolicy: "REJECT_DUPLICATE",
        }),
      );
      return handle.workflowId;
    },
    close: () => connection.close(),
  };
}
