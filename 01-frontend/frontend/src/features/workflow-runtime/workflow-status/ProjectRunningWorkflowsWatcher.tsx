import { v1TemporalJobsListTemporalWorkflows } from '@/api-clients/backend';
import { useLiveQuery } from '@tanstack/react-db';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');
const closedStatuses = [
  'Completed',
  'Failed',
  'Canceled',
  'Terminated',
  'TimedOut',
] as const;

/**
 * Keeps project summaries current after observed or externally started jobs finish.
 * Exact observed-ID metadata owns completion; project samples only trigger broad refreshes.
 * @returns No UI; the route owns this observer across feature unmounts.
 */
export const ProjectRunningWorkflowsWatcher = () => {
  const { verfahrenId } = projectRoute.useParams();
  const { projectVersion, refetchNodeSummaries, workflowsManager } =
    projectRoute.useLoaderData();
  const {
    data: statuses = [],
    isError,
    isLoading,
  } = useLiveQuery(workflowsManager.getRunningCollection());
  const closed = useQuery({
    queryKey: [
      'project-temporal-workflows',
      verfahrenId,
      projectVersion,
      'latest-closed',
    ],
    queryFn: async () => {
      const pages = await Promise.all(
        closedStatuses.map(async (executionStatus) => {
          const { data } = await v1TemporalJobsListTemporalWorkflows({
            query: {
              projectId: verfahrenId,
              projectVersion,
              executionStatus,
              pageSize: 1,
            },
            throwOnError: true,
          });
          return data.workflows;
        }),
      );
      return pages.flat();
    },
    refetchInterval: 30_000,
  });
  const previousClosedRuns = useRef(new Set<string>());
  const { mutate: refreshSummaries } = useMutation({
    mutationFn: refetchNodeSummaries,
  });

  // eslint-disable-next-line no-restricted-syntax -- reconciles authoritative scoped status reads and newly closed runs with route-owned project data.
  useEffect(() => {
    if (isLoading || isError || closed.isPending || closed.isError) {
      return;
    }
    const newlyClosed = closed.data.filter(
      (workflow) => !previousClosedRuns.current.has(workflow.runId),
    );
    previousClosedRuns.current = new Set(
      closed.data.map((workflow) => workflow.runId),
    );
    if (workflowsManager.reconcileRunningWorkflows(statuses, newlyClosed)) {
      refreshSummaries();
    }
  }, [
    closed.data,
    closed.isPending,
    closed.isError,
    isError,
    isLoading,
    statuses,
    refreshSummaries,
    workflowsManager,
  ]);

  return null;
};
