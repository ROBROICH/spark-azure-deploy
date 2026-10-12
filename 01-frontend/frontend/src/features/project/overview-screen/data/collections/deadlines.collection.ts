import {
  v1ProjectLogicCreateDeadline as createDeadline,
  v1ProjectLogicDeleteDeadline as deleteDeadline,
  v1ProjectLogicListDeadlines as listDeadlines,
  type V1ProjectLogicCreateDeadlineData as CreateDeadlineData,
  type DeadlineResponse,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { BasicIndex, createCollection } from '@tanstack/react-db';
import { getProjectIdFromCollectionOptions } from '@/features/project/data/collections/projectScopedCollection';

type CreateDeadlineRequest = CreateDeadlineData['body'];

const deadlineToCreatePayload = (
  item: DeadlineResponse,
): CreateDeadlineRequest => ({
  projectId: item.projectId,
  deadlineType: item.deadlineType,
  startAt: item.startAt,
  endAt: item.endAt,
  legalBasis: item.legalBasis,
});

export const invalidateDeadlineReads = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['deadlines'] }),
    queryClient.invalidateQueries({ queryKey: ['deadline-detail'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar-deadlines'] }),
    queryClient.invalidateQueries({ queryKey: ['deadline-dates'] }),
    queryClient.invalidateQueries({ queryKey: ['upcoming-deadline'] }),
  ]);
};

export const deadlinesCollection = createCollection(
  queryCollectionOptions({
    id: 'deadlines',
    syncMode: 'on-demand',
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    queryKey: ['deadlines'],
    queryFn: async (ctx): Promise<DeadlineResponse[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const { data } = await listDeadlines({
        query: {
          projectId,
          limit: ctx.meta?.loadSubsetOptions?.limit ?? 50,
          offset: ctx.meta?.loadSubsetOptions?.offset ?? 0,
        },
      });
      if (!data) {
        throw new Error('Failed to fetch deadlines');
      }
      return data;
    },
    queryClient,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const { data } = await createDeadline({
            body: deadlineToCreatePayload(mutation.modified),
          });
          if (!data) {
            throw new Error('Failed to create deadline');
          }
          return data;
        }),
      );
      await invalidateDeadlineReads();
      return results;
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await deleteDeadline({
            path: { deadlineId: mutation.key },
            throwOnError: true,
          });
        }),
      );
      await invalidateDeadlineReads();
    },
  }),
);
