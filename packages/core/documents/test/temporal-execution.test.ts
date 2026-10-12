import { describe, expect, test } from "bun:test";
import { Client, Connection } from "@temporalio/client";
import {
  DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW,
  DOCUMENT_MANAGEMENT_TASK_QUEUE,
  type DocumentManagementFileProcessingTemporalInput,
} from "@spark-temporal/contracts";
import { DocumentTemporalCommandsService } from "../src/temporal/commands.ts";

const address = process.env.DMS_TEST_TEMPORAL_ADDRESS;
const namespace = process.env.DMS_TEST_TEMPORAL_NAMESPACE;

describe.skipIf(address === undefined || namespace === undefined)(
  "DMS native Temporal execution identity",
  () => {
    test("reconciles the same started attempt and never cancels a later run through an old run ID", async () => {
      const connection = await Connection.connect({ address: address! });
      const workflow = new Client({ connection, namespace: namespace! }).workflow;
      const commands = new DocumentTemporalCommandsService({
        temporalHost: address!,
        temporalNamespace: namespace!,
      });
      const projectId = crypto.randomUUID();
      const executionId = `b03-${crypto.randomUUID()}`;
      const input: DocumentManagementFileProcessingTemporalInput = {
        request: {
          kind: "zip",
          executionId,
          projectId,
          projectVersion: 1,
          workflowName: DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW,
          taskQueue: DOCUMENT_MANAGEMENT_TASK_QUEUE,
          idReusePolicy: "REJECT_DUPLICATE",
          idConflictPolicy: "USE_EXISTING",
          workflowInput: {
            fileId: crypto.randomUUID(),
            projectId,
            filename: "input.zip",
            fileType: "zip",
            zipPath: "test/input.zip",
            entryFileType: "document",
            sourceProjectVersion: 1,
            workflowActor: null,
          },
        },
      };
      let latestRun: string | undefined;
      try {
        const first = await commands.startFileProcessing(input);
        latestRun = first.runId;
        expect((await commands.startFileProcessing(input)).runId).toBe(first.runId);
        await workflow
          .getHandle(executionId, first.runId)
          .terminate("B03 completed-attempt reconciliation");
        const recovered = await commands.startFileProcessing(input);
        expect(recovered).toMatchObject({ runId: first.runId, workflowStatus: "TERMINATED" });
        const later = await workflow.start(DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW, {
          taskQueue: DOCUMENT_MANAGEMENT_TASK_QUEUE,
          workflowId: executionId,
          workflowIdReusePolicy: "ALLOW_DUPLICATE",
          args: [input.request.workflowInput],
        });
        latestRun = later.firstExecutionRunId;
        expect(latestRun).not.toBe(first.runId);
        await commands.cancelFileProcessing({ workflowId: executionId, runId: first.runId });
        expect((await later.describe()).status.name).toBe("RUNNING");
        await commands.cancelFileProcessing({ workflowId: executionId, runId: latestRun });
        await commands.cancelFileProcessing({ workflowId: executionId, runId: latestRun });
        const history = await later.fetchHistory();
        expect(
          history.events?.some(
            (event) =>
              event.workflowExecutionCancelRequestedEventAttributes !== undefined &&
              event.workflowExecutionCancelRequestedEventAttributes !== null,
          ),
        ).toBeTrue();
      } finally {
        if (latestRun !== undefined)
          await workflow.getHandle(executionId, latestRun).terminate("B03 test cleanup");
        await commands.close();
        await connection.close();
      }
    }, 20_000);
  },
);
