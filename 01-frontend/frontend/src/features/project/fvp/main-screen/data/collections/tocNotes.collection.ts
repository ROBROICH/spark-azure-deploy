import {
  v1FormalCompletenessCreateTocNotes as createTocNotes,
  v1FormalCompletenessGetTocNotes as getTocNotes,
  v1FormalCompletenessUpdateTocNote as updateTocNote,
  type TableContentNotesResponse,
  type TocNotesWithStatusResponse,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryOptions } from '@tanstack/react-query';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';
import { tocNoteSchema, type TocNote } from '../schemas/tocNote.schema';

const createEmptyTocNotesResponse = (): TocNotesWithStatusResponse => ({
  status: null,
  notes: [],
});

const createTocNotesFetchError = (
  error: unknown,
  response: Response | undefined,
): Error => {
  if (error instanceof Error) {
    return error;
  }

  const status = response?.status;
  const message =
    typeof status === 'number'
      ? `Request failed with status ${status}`
      : 'Failed to fetch TOC notes';

  return new Error(message, { cause: error });
};

const mapApiNoteToTocNote = (note: TableContentNotesResponse): TocNote =>
  tocNoteSchema.parse({
    id: note.id,
    projectId: note.projectId,
    content: note.content,
    isResolved: note.isResolved,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  });

const mapTocNotesResponseToTocNotes = (
  response: TocNotesWithStatusResponse,
): TocNote[] => response.notes.map(mapApiNoteToTocNote);

export const getTocNotesResponseQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['toc-notes-response', projectId],
    queryFn: async (): Promise<TocNotesWithStatusResponse> => {
      const result = (await getTocNotes({
        path: { projectId: projectId },
      })) as {
        data?: TocNotesWithStatusResponse | null;
        error?: unknown;
        response?: Response;
      };

      if (result.data !== undefined && result.data !== null) {
        return result.data;
      }

      if (result.error !== undefined) {
        throw createTocNotesFetchError(result.error, result.response);
      }

      return createEmptyTocNotesResponse();
    },
    enabled: Boolean(projectId),
  });

/**
 * Extracts the projectId value from TanStack DB's on-demand loadSubsetOptions.
 *
 * When a useLiveQuery uses `.where(eq(notes.projectId, projectId))`,
 * TanStack DB passes those predicates as a serialized filter structure
 * into `loadSubsetOptions`. This helper parses that structure and
 * pulls out the projectId filter value so we can pass it to the REST API.
 */
/**
 * Singleton collection for all TOC notes across all projects.
 *
 * Architecture:
 * - Uses `syncMode: 'on-demand'` so data is fetched per-project when a
 *   component subscribes with `where(eq(projectId, '...'))`.
 * - Notes from different projects accumulate in the same collection.
 *   The `where()` clause in useLiveQuery filters to the active project.
 * - `queryKey` includes the extracted projectId so TanStack Query caches
 *   and deduplicates requests per project independently.
 * - `queryFn` receives the projectId via `ctx.meta.loadSubsetOptions`
 *   and calls the per-project REST endpoint.
 *
 * Data shape in this collection: { id, projectId, content, isResolved, createdAt, updatedAt }
 */
export const tocNotesCollection = createCollection(
  queryCollectionOptions({
    id: 'toc-notes',
    syncMode: 'on-demand',
    queryKey: (opts) => getProjectScopedCollectionQueryKey('toc-notes', opts),
    queryFn: async (ctx): Promise<TocNote[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const response = await queryClient.fetchQuery(
        getTocNotesResponseQueryOptions(projectId),
      );

      return mapTocNotesResponseToTocNotes(response);
    },
    queryClient,
    getKey: (item) => item.id,

    // Optimistic insert: creates note via API, returns server response
    // to replace the optimistic local entry with the real one.
    onInsert: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (m) => {
          const { data } = await createTocNotes({
            path: { projectId: m.modified.projectId },
            body: [{ content: m.modified.content }],
          });
          if (!data) {
            throw new Error('Failed to create TOC note');
          }
          const note = data[0];
          if (!note) {
            throw new Error('Failed to create TOC note');
          }

          return mapApiNoteToTocNote(note);
        }),
      );
      return results;
    },

    // Optimistic update: patches isResolved via API.
    // Uses original.projectId and original.id to build the API path.
    onUpdate: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (m) => {
          if (!('isResolved' in m.changes)) {
            return {
              ...m.original,
              ...m.changes,
            };
          }

          const { data } = await updateTocNote({
            path: {
              projectId: m.original.projectId,
              noteId: m.original.id,
            },
            body: {
              isResolved: m.changes.isResolved as boolean,
            },
          });
          if (!data) {
            throw new Error('Failed to update TOC note');
          }

          if ('id' in data) {
            return mapApiNoteToTocNote(data);
          }

          return {
            ...m.original,
            ...m.changes,
          };
        }),
      );

      return results;
    },
  }),
);
