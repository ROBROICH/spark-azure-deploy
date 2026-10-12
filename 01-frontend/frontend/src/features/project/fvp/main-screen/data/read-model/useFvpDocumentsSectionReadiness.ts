import { useFormalDocumentSummary } from './useDocuments';
import { useRequiredDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { useRequestSources } from '@/features/project/nachforderungen/data/requestQueries';

export const useFvpDocumentsSectionReadiness = (projectId: string) => {
  const { isLoading: documentsSummaryLoading } =
    useFormalDocumentSummary(projectId);
  const { isLoading: requiredDocumentsTreeLoading } =
    useRequiredDocumentsTree(projectId);
  const { isLoading: requestItemsLoading } = useRequestSources(projectId);

  return {
    isLoading:
      documentsSummaryLoading ||
      requiredDocumentsTreeLoading ||
      requestItemsLoading,
  };
};
