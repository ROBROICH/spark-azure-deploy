import {
  getDocAssignmentsProjectIdDocumentAssignmentsGet,
  patchDocumentProjectIdDocumentsFileIdPatch,
} from '@/api-clients/fcs-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';
import {
  documentAssignmentSchema,
  type DocumentAssignment,
} from '../schemas/documentAssignment.schema';
import {
  getRequiredDocumentTypeNameMap,
  getRequiredDocumentTypesResponseQueryOptions,
} from '../queries/requiredDocuments.query';

/**
 * Persists one assignment's human document-type through the FCS PATCH upsert
 * and reconciles local fields from the backend response.
 *
 * Fails closed: a returned `error` rejects the mutation so optimistic state is
 * rolled back instead of being treated as persisted. The check reads `error`
 * (not `!data`), so a real backend failure can never be parsed as success.
 */
const persistDocumentAssignment = async (
  base: DocumentAssignment,
  nextHumanTypeId: string | null,
): Promise<DocumentAssignment> => {
  const { data, error } = await patchDocumentProjectIdDocumentsFileIdPatch({
    path: {
      project_id: base.projectId,
      file_id: base.documentId,
    },
    body: {
      human_required_document_type_id: nextHumanTypeId,
    },
  });

  if (error) {
    throw new Error('Failed to persist document assignment');
  }

  const aiSuggestedDocumentTypeId =
    'ai_suggested_required_document_type_id' in data
      ? data.ai_suggested_required_document_type_id
      : base.aiSuggestedDocumentTypeId;
  const humanRequiredDocumentTypeId =
    'human_required_document_type_id' in data
      ? (data.human_required_document_type_id ?? null)
      : nextHumanTypeId;
  const documentTypeId =
    humanRequiredDocumentTypeId ?? aiSuggestedDocumentTypeId ?? null;

  return documentAssignmentSchema.parse({
    ...base,
    aiSuggestedDocumentTypeId,
    humanRequiredDocumentTypeId,
    documentTypeId,
  });
};

export const documentAssignmentsCollection = createCollection(
  queryCollectionOptions({
    id: 'document-assignments',
    syncMode: 'on-demand',
    queryKey: (opts) =>
      getProjectScopedCollectionQueryKey(
        'document-assignments',
        opts as Record<string, unknown>,
      ),
    queryFn:
      /**
       * Loads per-project document assignments and enriches them with
       * required-document names for table rendering.
       */
      async (ctx): Promise<DocumentAssignment[]> => {
        const projectId = getProjectIdFromCollectionOptions(
          ctx.meta?.loadSubsetOptions as Record<string, unknown>,
        );
        if (!projectId) {
          return [];
        }

        const [assignmentsResponse, requiredTypesResponse] = await Promise.all([
          getDocAssignmentsProjectIdDocumentAssignmentsGet({
            path: { project_id: projectId },
          }),
          queryClient.fetchQuery(
            getRequiredDocumentTypesResponseQueryOptions(projectId),
          ),
        ]);

        const assignments = assignmentsResponse.data;
        const requiredTypes = requiredTypesResponse;

        if (!assignments) {
          throw new Error('Failed to fetch document assignments');
        }
        const typeIdToName = getRequiredDocumentTypeNameMap(requiredTypes);

        return assignments.items.map((assignment) => {
          const aiSuggestedDocumentTypeId =
            assignment.ai_suggested_required_document_type_id;
          const humanRequiredDocumentTypeId =
            assignment.human_required_document_type_id;
          const documentTypeId =
            humanRequiredDocumentTypeId ?? aiSuggestedDocumentTypeId;

          return documentAssignmentSchema.parse({
            projectId,
            documentId: assignment.file_id,
            aiSuggestedDocumentTypeId,
            humanRequiredDocumentTypeId,
            documentTypeId,
            documentTypeName: documentTypeId
              ? (typeIdToName.get(documentTypeId) ?? null)
              : null,
            isResolved: false,
          });
        });
      },
    queryClient,
    getKey: (item) => item.documentId,
    onInsert:
      /**
       * Persists newly created assignment rows through the same fail-closed
       * PATCH upsert so a single user action is one backend write.
       */
      async ({ transaction }) =>
        Promise.all(
          transaction.mutations.map((m) => {
            const nextHumanTypeId =
              m.modified.humanRequiredDocumentTypeId ??
              m.modified.documentTypeId ??
              null;

            return persistDocumentAssignment(m.modified, nextHumanTypeId);
          }),
        ),
    onUpdate:
      /**
       * Persists manual assignment changes and reconciles local assignment
       * fields with the backend response.
       */
      async ({ transaction }) =>
        Promise.all(
          transaction.mutations.map((m) => {
            const nextHumanTypeId =
              'humanRequiredDocumentTypeId' in m.changes
                ? (m.changes.humanRequiredDocumentTypeId ?? null)
                : (m.changes.documentTypeId ?? null);

            return persistDocumentAssignment(
              { ...m.original, ...m.changes },
              nextHumanTypeId,
            );
          }),
        ),
  }),
);
