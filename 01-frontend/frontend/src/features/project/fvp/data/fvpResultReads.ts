import { queryClient } from '@/integrations/tanstack-query/root-provider';

const invalidate = (projectId: string, prefixes: string[]) => {
  for (const prefix of prefixes) {
    void queryClient.invalidateQueries({ queryKey: [prefix, projectId] });
  }
};

export const retryTableOfContentsReads = (projectId: string) =>
  invalidate(projectId, ['toc-notes', 'toc-notes-response', 'request-items']);

export const retryRequiredDocumentsReads = (projectId: string) =>
  invalidate(projectId, [
    'required-documents',
    'document-assignments',
    'request-items',
  ]);

export const retryPlausibilityReads = (projectId: string) =>
  invalidate(projectId, ['pp-contradictions', 'request-items']);

export const retryDocumentsTableReads = (projectId: string) =>
  invalidate(projectId, [
    'files',
    'required-documents',
    'document-assignments',
    'request-items',
  ]);
