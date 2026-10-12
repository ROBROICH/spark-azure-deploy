import { v1TemporalJobsListTemporalWorkflows } from '@/api-clients/backend';
import { useInfiniteQuery } from '@tanstack/react-query';

export const useWorkflowHistory = (
  projectId: string,
  projectVersion: number,
  enabled: boolean,
) => {
  return useInfiniteQuery({
    queryKey: [
      'project-temporal-workflows',
      projectId,
      projectVersion,
      'history',
    ],
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await v1TemporalJobsListTemporalWorkflows({
        query: {
          projectId,
          projectVersion,
          executionStatus: 'all',
          pageSize: 50,
          nextPageToken: pageParam,
        },
        throwOnError: true,
      });
      return data;
    },
    getNextPageParam: (page) => page.nextPageToken ?? undefined,
  });
};
