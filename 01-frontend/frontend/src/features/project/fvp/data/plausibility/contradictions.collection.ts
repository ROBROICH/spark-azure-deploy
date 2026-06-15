import * as Sentry from '@sentry/react';
import {
  type PlausibilityNoteStatus,
  getNotesPlausibilityNotesProjectIdGet,
  updateNotePlausibilityNotesNotesNoteIdPatch,
} from '@/api-clients/pns-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';
import type { StoredContradiction } from './contradiction.schema';
import {
  EXPECTED_MAX_NORMALIZED_RATING,
  EXPECTED_MIN_NORMALIZED_RATING,
  getNormalizedRating,
} from '../../plausibility-check/data/filtering/contradictionFilters';

const reportUnexpectedContradictionRating = (
  contradiction: Pick<StoredContradiction, 'id' | 'rating'>,
  projectId: string,
) => {
  const normalizedRating = getNormalizedRating(contradiction);
  if (
    !Number.isFinite(normalizedRating) ||
    (normalizedRating >= EXPECTED_MIN_NORMALIZED_RATING &&
      normalizedRating <= EXPECTED_MAX_NORMALIZED_RATING)
  ) {
    return;
  }

  Sentry.captureException(
    new Error('Contradiction rating outside expected range'),
    {
      tags: {
        feature: 'plausibility-check',
      },
      extra: {
        contradictionId: contradiction.id,
        projectId,
        rawRating: contradiction.rating,
        normalizedRating,
        expectedMin: EXPECTED_MIN_NORMALIZED_RATING,
        expectedMax: EXPECTED_MAX_NORMALIZED_RATING,
      },
    },
  );
};

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

      const { data } = await getNotesPlausibilityNotesProjectIdGet({
        path: { project_id: projectId },
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
        reportUnexpectedContradictionRating(item, projectId);

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

          await updateNotePlausibilityNotesNotesNoteIdPatch({
            path: { note_id: mutation.original.id },
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
