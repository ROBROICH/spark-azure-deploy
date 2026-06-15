import {
  createDeadlineDeadlinesPost,
  deleteDeadlineDeadlinesDeadlineIdDelete,
  listDeadlinesDeadlinesGet,
  updateDeadlineDeadlinesDeadlineIdPatch,
  type CreateDeadlineRequest,
  type DeadlineResponse,
  type UpdateDeadlineRequest,
} from '@/api-clients/pls-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';

export const deadlinesCollection = createCollection(
  queryCollectionOptions({
    id: 'deadlines',
    syncMode: 'on-demand',
    queryKey: (opts) => getProjectScopedCollectionQueryKey('deadlines', opts),
    queryFn: async (ctx): Promise<DeadlineResponse[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const { data } = await listDeadlinesDeadlinesGet({
        query: { project_id: projectId },
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
          const { data } = await createDeadlineDeadlinesPost({
            body: mutation.modified as CreateDeadlineRequest,
          });
          if (!data) {
            throw new Error('Failed to create deadline');
          }
          return data;
        }),
      );
      return results;
    },
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];
      const { data } = await updateDeadlineDeadlinesDeadlineIdPatch({
        path: { deadline_id: original.id },
        body: changes as UpdateDeadlineRequest,
      });
      if (!data) {
        throw new Error('Failed to update deadline');
      }
      return data;
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await deleteDeadlineDeadlinesDeadlineIdDelete({
            path: { deadline_id: mutation.key },
            throwOnError: true,
          });
        }),
      );
    },
  }),
);
