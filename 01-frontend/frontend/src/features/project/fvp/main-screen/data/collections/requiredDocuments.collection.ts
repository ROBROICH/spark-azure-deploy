import {
  createRequiredDocumentTypeProjectIdRequiredDocumentTypesPost,
  deleteRequiredDocumentTypeProjectIdRequiredDocumentTypesDocumentTypeIdDelete,
  patchRequiredDocTypeProjectIdRequiredDocumentTypesDocumentTypeIdPatch,
  type RequiredDocumentResponse,
} from '@/api-clients/fcs-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';

import {
  requiredDocumentSchema,
  type RequiredDocument,
} from '../schemas/requiredDocument.schema';
import {
  flattenRequiredDocuments,
  getRequiredDocumentTypesResponseQueryOptions,
} from '../queries/requiredDocuments.query';

const requiredDocumentsQueryKey = (projectId: string) =>
  projectId ? ['required-documents', projectId] : ['required-documents'];

export const requiredDocumentsCollection = createCollection(
  queryCollectionOptions({
    id: 'required-documents',
    syncMode: 'on-demand',
    queryKey: (opts) =>
      getProjectScopedCollectionQueryKey('required-documents', opts),
    queryFn: async (ctx): Promise<RequiredDocument[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const response = await queryClient.fetchQuery(
        getRequiredDocumentTypesResponseQueryOptions(projectId),
      );

      return flattenRequiredDocuments(projectId, response.categories);
    },
    queryClient,
    getKey: (item) => item.id,
    onInsert:
      /**
       * Creates custom required-document types and invalidates per-project
       * caches so server order and ids stay authoritative.
       */
      async ({ transaction }) => {
        const results: RequiredDocument[] = await Promise.all(
          transaction.mutations.map(async (m) => {
            const { data } =
              await createRequiredDocumentTypeProjectIdRequiredDocumentTypesPost(
                {
                  path: { project_id: m.modified.projectId },
                  body: { document_name: m.modified.name },
                },
              );
            if (!data) {
              throw new Error('Failed to create custom doc type');
            }

            if (!('document_type_id' in data)) {
              return requiredDocumentSchema.parse({
                ...m.modified,
                origin: 'custom' as const,
              });
            }

            const created: RequiredDocumentResponse = data;
            return requiredDocumentSchema.parse({
              ...m.modified,
              id: created.document_type_id,
              name: created.document_name,
              origin: created.origin,
              isResolved: created.is_resolved,
            });
          }),
        );

        const projectIds = new Set(
          transaction.mutations.map((m) => m.modified.projectId),
        );
        await Promise.all(
          Array.from(projectIds).map((projectId) =>
            queryClient.invalidateQueries({
              queryKey: requiredDocumentsQueryKey(projectId),
            }),
          ),
        );

        return results;
      },
    onDelete: async ({ transaction }) => {
      // Fail closed: `throwOnError` rejects the transaction on a non-2xx
      // delete so the destructive mutation is never treated as persisted and
      // the optimistic removal rolls back.
      await Promise.all(
        transaction.mutations.map(async (m) => {
          const item = m.original;
          await deleteRequiredDocumentTypeProjectIdRequiredDocumentTypesDocumentTypeIdDelete(
            {
              path: {
                project_id: item.projectId,
                document_type_id: m.key,
              },
              throwOnError: true,
            },
          );
        }),
      );

      const projectIds = new Set(
        transaction.mutations.map((m) => m.original.projectId),
      );
      await Promise.all(
        Array.from(projectIds).map((projectId) =>
          queryClient.invalidateQueries({
            queryKey: requiredDocumentsQueryKey(projectId),
          }),
        ),
      );
    },
    onUpdate:
      /**
       * Persists required-document mutations (rename/resolve), updates local
       * rows from backend payloads, and invalidates query caches on renames.
       */
      async ({ transaction }) => {
        const projectIdsToInvalidate = new Set<string>();

        const results = await Promise.all(
          transaction.mutations.map(async (m) => {
            const body: { document_name?: string; is_resolved?: boolean } = {};

            if (
              typeof m.changes.name === 'string' &&
              m.changes.name !== m.original.name
            ) {
              body.document_name = m.changes.name;
              projectIdsToInvalidate.add(m.original.projectId);
            }

            if (
              typeof m.changes.isResolved === 'boolean' &&
              m.changes.isResolved !== m.original.isResolved
            ) {
              body.is_resolved = m.changes.isResolved;
            }

            if (Object.keys(body).length === 0) {
              return requiredDocumentSchema.parse({
                ...m.original,
                ...m.changes,
              });
            }

            const { data } =
              await patchRequiredDocTypeProjectIdRequiredDocumentTypesDocumentTypeIdPatch(
                {
                  path: {
                    project_id: m.original.projectId,
                    document_type_id: m.key,
                  },
                  body,
                },
              );
            if (!data) {
              throw new Error('Failed to update custom doc type');
            }

            if (!('document_type_id' in data)) {
              return requiredDocumentSchema.parse({
                ...m.original,
                ...m.changes,
              });
            }

            const updated: RequiredDocumentResponse = data;
            return requiredDocumentSchema.parse({
              ...m.original,
              ...m.changes,
              id: updated.document_type_id,
              name: updated.document_name,
              origin: updated.origin,
              isResolved: updated.is_resolved,
            });
          }),
        );

        if (projectIdsToInvalidate.size > 0) {
          await Promise.all(
            Array.from(projectIdsToInvalidate).map((projectId) =>
              queryClient.invalidateQueries({
                queryKey: requiredDocumentsQueryKey(projectId),
              }),
            ),
          );
        }

        return results;
      },
  }),
);
