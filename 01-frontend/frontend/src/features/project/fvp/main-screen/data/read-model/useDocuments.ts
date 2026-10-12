import {
  v1FormalCompletenessGetFormalDocumentSummary,
  v1FormalCompletenessListFormalDocuments,
} from '@/api-clients/backend';
import { DOCUMENT_STATUS } from '@/features/project/data/document-tree/documentTree.types';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';

export type DocumentListFilters = {
  search?: string;
  documentTypeId?: string[];
  status?: ('assigned' | 'unassigned' | 'requested')[];
};

const PAGE_SIZE = 50;
// The API's "requested" means the file is on the request list, not the
// document status "Nachgefordert" (DOCUMENT_STATUS.requested).
const STATUS_BY_API_STATUS = {
  assigned: DOCUMENT_STATUS.assigned,
  unassigned: DOCUMENT_STATUS.unassigned,
  requested: DOCUMENT_STATUS.onRequestList,
} as const;

/**
 * Assignment and request-status filters are evaluated before paging by the server.
 * @param projectId - Project owning the active formal-completeness view.
 * @param filters - Complete-dataset search and assignment filters.
 * @returns Loaded display rows and native continuation/error state, not a readiness summary.
 */
export const useDocuments = (
  projectId: string,
  filters: DocumentListFilters = {},
) => {
  const projectVersion = useProjectRouteVersion();
  const query = useInfiniteQuery({
    queryKey: ['formal-documents', projectId, projectVersion, filters],
    queryFn: projectId
      ? async ({ pageParam }) => {
          const { data } = await v1FormalCompletenessListFormalDocuments({
            path: { projectId },
            query: {
              projectVersion,
              ...filters,
              limit: PAGE_SIZE,
              offset: pageParam,
            },
            throwOnError: true,
          });
          return data;
        }
      : skipToken,
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, offset) =>
      lastPage.length === PAGE_SIZE ? offset + PAGE_SIZE : undefined,
    select: (data) => data.pages.flat(),
  });
  const documents = (query.data ?? []).map((file) => ({
    id: file.id,
    path: file.filename,
    createdAt: file.createdAt,
    mimeType: file.mimeType,
    linkedDocumentTypeId: file.documentTypeId,
    linkedDocumentTypeHumanApproved: file.humanRequiredDocumentTypeId !== null,
    documentTypeName: file.documentTypeName,
    status: STATUS_BY_API_STATUS[file.status],
    confidence: file.confidence,
  }));
  return {
    documents,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
};

export const useFormalDocumentSummary = (projectId: string) => {
  const projectVersion = useProjectRouteVersion();
  return useQuery({
    queryKey: ['formal-document-summary', projectId, projectVersion],
    queryFn: projectId
      ? async () => {
          const { data } = await v1FormalCompletenessGetFormalDocumentSummary({
            path: { projectId },
            query: { projectVersion },
            throwOnError: true,
          });
          return data;
        }
      : skipToken,
  });
};
