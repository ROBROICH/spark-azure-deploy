import { useDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useDocumentsTree';
import { useRequiredDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import { eq, useLiveQuery } from '@tanstack/react-db';

export const useFvpDocumentsSectionReadiness = (projectId: string) => {
  const { isLoading: documentsTreeLoading } = useDocumentsTree(projectId);
  const { isLoading: requiredDocumentsTreeLoading } =
    useRequiredDocumentsTree(projectId);
  const { isLoading: requestItemsLoading } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, projectId)),
  );

  return {
    isLoading:
      documentsTreeLoading ||
      requiredDocumentsTreeLoading ||
      requestItemsLoading,
  };
};
