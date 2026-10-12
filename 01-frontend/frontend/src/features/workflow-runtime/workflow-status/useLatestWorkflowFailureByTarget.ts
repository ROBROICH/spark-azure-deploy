import { v1TemporalJobsListTemporalWorkflowsByType } from '@/api-clients/backend';
import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { useQueries } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { chunk } from 'es-toolkit';
import { useRunningWorkflow } from './useRunningWorkflow';
import { useWorkflowHistoryRefetch } from './useWorkflow';
import { getRunFailure, getTargetWorkflowId } from './workflowStatus.helpers';
import type {
  WorkflowFailureCode,
  WorkflowTypeName,
} from './workflowStatus.types';

const route = getRouteApi('/verfahren/$verfahrenId');
// 50 ids keep one request line near 5 KB, well under Node's 16 KB header limit.
const WORKFLOW_IDS_PER_REQUEST = 50;

const readWorkflowRuns = async (args: {
  projectId: string;
  projectVersion: number;
  workflowIds: string[];
  workflowType: WorkflowTypeName;
}) => {
  const runs: WorkflowsBase[] = [];
  let nextPageToken: string | undefined;
  do {
    // Each page needs the token of the previous one; one id can have several runs.
    // eslint-disable-next-line no-await-in-loop -- pages of one visibility query are sequential by contract.
    const { data } = await v1TemporalJobsListTemporalWorkflowsByType({
      path: { projectId: args.projectId },
      query: {
        executionStatus: 'all',
        nextPageToken,
        pageSize: 100,
        projectVersion: args.projectVersion,
        workflowIds: args.workflowIds,
        workflowType: args.workflowType,
      },
      throwOnError: true,
    });
    runs.push(...data.workflows);
    nextPageToken = data.nextPageToken ?? undefined;
  } while (nextPageToken !== undefined);
  return runs;
};

const getNewestRunByWorkflowId = (runs: ReadonlyArray<WorkflowsBase>) => {
  const newestRunByWorkflowId = new Map<string, WorkflowsBase>();
  for (const run of runs) {
    const newestRun = newestRunByWorkflowId.get(run.workflowId);
    if (
      newestRun === undefined ||
      Date.parse(run.workflowStartTime ?? '') >
        Date.parse(newestRun.workflowStartTime ?? '')
    ) {
      newestRunByWorkflowId.set(run.workflowId, run);
    }
  }
  return newestRunByWorkflowId;
};

/**
 * Reads the newest run of many targets of one workflow type by their exact
 * workflow ids, so a list asks once per 50 targets instead of once per item and
 * does not depend on Temporal's list order.
 * @param args - Workflow type and the target ids its workflow ids end with.
 * @returns The failure code of each target whose newest run failed.
 */
export const useLatestWorkflowFailureByTarget = (args: {
  targetIds: ReadonlyArray<string>;
  workflowType: WorkflowTypeName;
}): {
  failureCodeByTargetId: ReadonlyMap<string, WorkflowFailureCode>;
} => {
  const { targetIds, workflowType } = args;
  const { verfahrenId: projectId } = route.useParams();
  const { projectVersion } = route.useLoaderData();
  const targetIdByWorkflowId = new Map(
    targetIds.map((targetId) => [
      getTargetWorkflowId({
        projectId,
        projectVersion,
        targetId,
        workflowType,
      }),
      targetId,
    ]),
  );
  const workflowIdChunks = chunk(
    [...targetIdByWorkflowId.keys()].sort(),
    WORKFLOW_IDS_PER_REQUEST,
  );
  const reads = useQueries({
    queries: workflowIdChunks.map((workflowIds) => ({
      queryKey: [
        'project-temporal-workflows',
        projectId,
        projectVersion,
        'latest-by-workflow-id',
        workflowType,
        ...workflowIds,
      ],
      queryFn: () =>
        readWorkflowRuns({
          projectId,
          projectVersion,
          workflowIds,
          workflowType,
        }),
    })),
  });
  const { isRunning, runningWorkflowIds } = useRunningWorkflow({
    workflowType,
  });
  useWorkflowHistoryRefetch({
    isRunning,
    refresh: () => Promise.all(reads.map((read) => read.refetch())),
    // A target's run can settle while another run of the type keeps running.
    runningKey: runningWorkflowIds.join(' '),
  });

  const failureCodeByTargetId = new Map<string, WorkflowFailureCode>();
  const newestRuns = getNewestRunByWorkflowId(
    reads.flatMap((read) => read.data ?? []),
  );
  for (const [workflowId, run] of newestRuns) {
    const targetId = targetIdByWorkflowId.get(workflowId);
    const failure = getRunFailure(run);
    if (targetId === undefined || failure === null) {
      continue;
    }
    failureCodeByTargetId.set(targetId, failure.errorCode);
  }

  return { failureCodeByTargetId };
};
