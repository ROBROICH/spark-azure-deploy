import {
  type PlausibilityNoteStatus,
  v1PlausibilityNotesGetPlausibilityNotes as getPlausibilityNotes,
  v1PlausibilityNotesUpdatePlausibilityNote as updatePlausibilityNote,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';
import type { StoredContradiction } from './contradiction.schema';

export const contradictionsCollection = createCollection(
  queryCollectionOptions({
    id: 'pp-contradictions',
    syncMode: 'on-demand',
    queryKey: (opts) =>
      getProjectScopedCollectionQueryKey(
        'pp-contradictions',
        opts as Record<string, unknown>,
      ),
    queryFn: async (ctx): Promise<StoredContradiction[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const { data } = await getPlausibilityNotes({
        path: { projectId: projectId },
      });
      if (!data) {
        throw new Error('Failed to fetch contradictions');
      }

      const contradictions: StoredContradiction[] = [];

      for (const item of data.contradictions) {
        const occurrences = item.occurrences;
        if (occurrences.length === 0) {
          continue;
        }

        contradictions.push({
          projectId,
          ...item,
          occurrences,
        });
      }

      return contradictions;
    },
    queryClient,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (mutation) => {
          if (!('status' in mutation.changes)) {
            return {
              ...mutation.original,
              ...mutation.changes,
            };
          }

          await updatePlausibilityNote({
            path: { noteId: mutation.original.id },
            body: {
              status: mutation.changes.status as PlausibilityNoteStatus,
            },
            throwOnError: true,
          });

          return {
            ...mutation.original,
            ...mutation.changes,
          };
        }),
      );

      return results;
    },
  }),
);
