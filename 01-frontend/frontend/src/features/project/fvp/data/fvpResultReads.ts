import { queryClient } from '@/integrations/tanstack-query/root-provider';

const invalidate = (projectId: string, prefixes: string[]) => {
  for (const prefix of prefixes) {
    void queryClient.invalidateQueries({ queryKey: [prefix, projectId] });
  }
};

export const retryTableOfContentsReads = (projectId: string) =>
  invalidate(projectId, ['toc-notes', 'toc-notes-response', 'request-sources']);

export const retryRequiredDocumentsReads = (projectId: string) =>
  invalidate(projectId, [
    'required-documents',
    'formal-document-summary',
    'formal-documents',
    'request-sources',
  ]);

export const retryPlausibilityReads = (projectId: string) =>
  invalidate(projectId, ['pp-contradictions', 'request-sources']);

export const retryDocumentsTableReads = (projectId: string) =>
  invalidate(projectId, [
    'required-documents',
    'formal-documents',
    'formal-document-summary',
  ]);
