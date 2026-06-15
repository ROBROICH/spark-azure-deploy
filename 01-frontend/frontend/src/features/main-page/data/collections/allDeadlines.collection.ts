import {
  listDeadlinesDeadlinesGet,
  type DeadlineResponse,
} from '@/api-clients/pls-module';
import { deadlineResponseArraySchema } from '@/features/main-page/data/schemas/apiResponse.schema';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

export const allDeadlinesCollection = createCollection(
  queryCollectionOptions({
    id: 'allDeadlines',
    queryKey: ['allDeadlines'],
    queryFn: async (): Promise<DeadlineResponse[]> => {
      const { data } = await listDeadlinesDeadlinesGet();
      if (!data) {
        throw new Error('Failed to fetch deadlines');
      }
      return deadlineResponseArraySchema.parse(data);
    },
    queryClient,
    getKey: (item) => item.id,
  }),
);
