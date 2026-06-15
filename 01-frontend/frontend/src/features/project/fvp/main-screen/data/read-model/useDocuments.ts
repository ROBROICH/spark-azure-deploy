import { eq, useLiveQuery } from '@tanstack/react-db';
import { useIsFetching } from '@tanstack/react-query';

import { useProjectFiles } from '@/features/project/data/project-files/useProjectFiles';
import { documentAssignmentsCollection } from '../collections/documentAssignments.collection';

/**
 * Collects project documents from the local DB-backed collections and normalizes them
 * into the table-ready shape used by the formal completeness check UI.
 * Combines file metadata with document assignments, then exposes
 * aggregated loading and error state for the current project.
 */
export const useDocuments = (projectId: string) => {
  const filesQueryKey = ['files', projectId] as const;
  const fetchingFilesCount = useIsFetching({ queryKey: filesQueryKey });
  const {
    files,
    isLoading: filesLoadingFromQuery,
    isError: filesError,
  } = useProjectFiles(projectId);

  const {
    data: assignments,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useLiveQuery((q) =>
    q
      .from({ assignmentRows: documentAssignmentsCollection })
      .where(({ assignmentRows }) => eq(assignmentRows.projectId, projectId)),
  );

  const assignmentByFileId = new Map(assignments.map((r) => [r.documentId, r]));
  const documents = files.map((file) => {
    const assignment = assignmentByFileId.get(file.id);
    return {
      id: file.id,
      path: file.filename,
      displayName: file.filename,
      createdAt: file.createdAt,
      mimeType: file.mimeType,
      linkedDocumentTypeId: assignment?.documentTypeId ?? null,
      // Avoid optional-chaining pitfall: `undefined !== null` would incorrectly mark as approved.
      linkedDocumentTypeHumanApproved:
        assignment !== undefined &&
        assignment.humanRequiredDocumentTypeId !== null,
      documentTypeName: assignment?.documentTypeName ?? null,
      isResolved: assignment?.isResolved ?? false,
      isDeleted: false,
    };
  });

  const filesLoading =
    filesLoadingFromQuery || (files.length === 0 && fetchingFilesCount > 0);

  return {
    documents,
    isLoading: filesLoading || assignmentsLoading,
    isError: filesError || assignmentsError,
  };
};
