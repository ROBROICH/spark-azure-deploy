import {
  listProjectTypesProjectTypesGet,
  type ProjectTypeResponse,
} from '@/api-clients/pls-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import { projectTypeResponseArraySchema } from './projectType.schema';

export const projectTypesCollection = createCollection(
  queryCollectionOptions({
    id: 'project-types',
    queryKey: ['project-types'],
    queryFn: async (): Promise<ProjectTypeResponse[]> => {
      const { data } = await listProjectTypesProjectTypesGet();
      if (!data) {
        throw new Error('Failed to fetch project types');
      }
      return projectTypeResponseArraySchema.parse(data);
    },
    queryClient,
    getKey: (item) => item.id,
  }),
);
