import type { Redacted } from "effect";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { heartbeat } from "@temporalio/activity";
import type { Client, WorkflowExecutionStatusName } from "@temporalio/client";
import type { PayloadCodec } from "@temporalio/common";
import { temporal as temporalProto } from "@temporalio/proto";
import { TEMPORAL_JOB_WEEKLY_ARCHIVAL_WORKFLOW } from "@spark-temporal/contracts";
import { and, asc, eq, inArray, isNull, not, notInArray, or } from "drizzle-orm";
import { better } from "better-drizzle";

import { temporalJobDatabaseSchema, workflowExecutions } from "../db/schema.ts";
import { temporalJobErrors } from "../errors.ts";
import {
  type ArchiveOneInput,
  type ListUnarchivedBatchInput,
  type UnarchivedRow,
} from "./contracts.ts";
import { historyArchive } from "./history-archiver.ts";
import { resolveHistoryEvents } from "./history-gateway.ts";

const TERMINAL_STATUSES = [
  "failed",
  "completed",
  "terminated",
  "cancelled",
  "timed_out",
] satisfies (typeof workflowExecutions.$inferSelect)["status"][];

const EventType = temporalProto.api.enums.v1.EventType;

const closingEventTypes = {
  COMPLETED: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
  FAILED: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
  CANCELLED: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED,
  TERMINATED: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED,
  TIMED_OUT: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT,
  CONTINUED_AS_NEW: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW,
  RUNNING: undefined,
  PAUSED: undefined,
  UNSPECIFIED: undefined,
  UNKNOWN: undefined,
} satisfies Record<WorkflowExecutionStatusName, temporalProto.api.enums.v1.EventType | undefined>;

function archivalStatus(status: string): UnarchivedRow["status"] {
  switch (status) {
    case "failed":
    case "completed":
    case "terminated":
    case "cancelled":
    case "timed_out":
      return status;
    default:
      throw new Error(`non-terminal archival status ${status}`);
  }
}

export function archivalActivities(
  postgres: PostgresScope<typeof temporalJobDatabaseSchema>,
  temporal: Client,
  payloadCodec: PayloadCodec,
  archiveObjects: S3Client,
  storage: {
    readonly bucket: string;
    readonly prefix: string;
    readonly encryptionKey: Redacted.Redacted<string>;
  },
) {
  return {
    async archivalListUnarchivedBatch(input: ListUnarchivedBatchInput) {
      const excluded = input.excludedKeys.map(([workflowId, runId]) =>
        and(eq(workflowExecutions.workflowId, workflowId), eq(workflowExecutions.runId, runId)),
      );
      const rows = await postgres.query(async (database) =>
        database
          .select({
            workflowId: workflowExecutions.workflowId,
            runId: workflowExecutions.runId,
            workflowType: workflowExecutions.workflowType,
            projectId: workflowExecutions.projectId,
            projectVersion: workflowExecutions.projectVersion,
            status: workflowExecutions.status,
          })
          .from(workflowExecutions)
          .where(
            and(
              inArray(workflowExecutions.status, TERMINAL_STATUSES),
              isNull(workflowExecutions.historyS3Key),
              notInArray(workflowExecutions.workflowType, [TEMPORAL_JOB_WEEKLY_ARCHIVAL_WORKFLOW]),
              excluded.length === 0 ? undefined : not(or(...excluded)!),
            ),
          )
          .orderBy(isNull(workflowExecutions.endTime), asc(workflowExecutions.endTime))
          .limit(input.batchSize),
      );

      return rows.map((row) => ({
        workflowId: row.workflowId,
        runId: row.runId,
        workflowType: row.workflowType,
        projectId: row.projectId,
        projectVersion: row.projectVersion === null ? null : String(row.projectVersion),
        status: archivalStatus(row.status),
      }));
    },

    async archivalArchiveOne(input: ArchiveOneInput) {
      const { row } = input;
      const detail = `${row.workflowId}/${row.runId}`;
      heartbeat(detail);
      const heartbeatTimer = setInterval(() => heartbeat(detail), 10_000);
      try {
        const handle = temporal.workflow.getHandle(row.workflowId, row.runId);
        const description = await handle.describe();
        const closingEventType = closingEventTypes[description.status.name];
        if (description.closeTime === undefined || closingEventType === undefined) {
          throw temporalJobErrors.ARCHIVE_NOT_READY();
        }
        const history = await handle.fetchHistory();
        if (history.events?.at(-1)?.eventType !== closingEventType) {
          throw temporalJobErrors.ARCHIVE_NOT_READY();
        }
        const archive = historyArchive(row, await resolveHistoryEvents(history, payloadCodec), {
          prefix: storage.prefix,
          encryptionKey: storage.encryptionKey,
        });
        await archiveObjects.send(
          new PutObjectCommand({
            Bucket: storage.bucket,
            Key: archive.key,
            Body: archive.body,
            ContentType: archive.contentType,
          }),
        );
        await postgres.query(async (transaction) =>
          better(transaction, { schema: temporalJobDatabaseSchema }).workflowExecutions.update({
            where: { workflowId: row.workflowId, runId: row.runId },
            data: { historyS3Key: archive.key },
          }),
        );
        return archive.key;
      } finally {
        clearInterval(heartbeatTimer);
      }
    },
  };
}
