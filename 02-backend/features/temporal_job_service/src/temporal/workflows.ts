import type { RetryPolicy } from "@temporalio/common";
import { continueAsNew, isCancellation, proxyActivities, workflowInfo } from "@temporalio/workflow";

import type { archivalActivities } from "../archival/activities.ts";
import { type WeeklyArchivalInput } from "../archival/contracts.ts";

type ArchivalActivities = ReturnType<typeof archivalActivities>;

const listActivities = proxyActivities<Pick<ArchivalActivities, "archivalListUnarchivedBatch">>({
  scheduleToCloseTimeout: 2 * 60_000,
});

const archiveRetry = {
  maximumAttempts: 3,
} satisfies RetryPolicy;

const archiveActivities = proxyActivities<Pick<ArchivalActivities, "archivalArchiveOne">>({
  startToCloseTimeout: 15 * 60_000,
  scheduleToCloseTimeout: 20 * 60_000,
  heartbeatTimeout: 30_000,
  retry: archiveRetry,
});

export async function WeeklyArchivalWorkflow(input: WeeklyArchivalInput) {
  const batchSize = input.batchSize ?? 100;
  let archived = input.archivedSoFar ?? 0;
  let failed = input.failedSoFar ?? 0;
  const failedKeys = [...(input.failedKeys ?? [])];

  while (true) {
    const rows = await listActivities.archivalListUnarchivedBatch({
      batchSize: batchSize,
      excludedKeys: failedKeys,
    });
    if (rows.length === 0) return { archived, failed };

    for (const row of rows) {
      try {
        const key = await archiveActivities.archivalArchiveOne({ row });
        if (key.trim().length > 0) {
          archived += 1;
          continue;
        }
      } catch (error) {
        if (isCancellation(error)) throw error;
      }
      failed += 1;
      failedKeys.push([row.workflowId, row.runId]);
    }

    if (workflowInfo().continueAsNewSuggested) {
      await continueAsNew<typeof WeeklyArchivalWorkflow>({
        batchSize: batchSize,
        archivedSoFar: archived,
        failedSoFar: failed,
        failedKeys: failedKeys,
      });
    }
  }
}
