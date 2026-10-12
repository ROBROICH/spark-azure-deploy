import { v1FormalCompletenessPatchDocumentAssignment } from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';

export const setDocumentType = async (
  projectId: string,
  documentId: string,
  typeId: string,
) => {
  await v1FormalCompletenessPatchDocumentAssignment({
    path: { projectId, fileId: documentId },
    body: { humanRequiredDocumentTypeId: typeId },
    throwOnError: true,
  });
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ['formal-documents', projectId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['formal-document-summary', projectId],
    }),
  ]);
};
