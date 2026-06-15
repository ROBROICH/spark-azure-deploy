import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';

const RECENT_DOCUMENTS_STORAGE_PREFIX = 'pdf-popout-recent:';
const MAX_RECENT_DOCUMENTS = 5;

const recentDocumentSchema = z.object({ documentId: z.string() });

const recentDocumentsSchema = z.array(recentDocumentSchema);

export type StoredRecentDocument = z.infer<typeof recentDocumentSchema>;
export type RecentDocument = {
  documentId: string;
  title: string;
};

const EMPTY_RECENT_DOCUMENTS: StoredRecentDocument[] = [];

/**
 * Tracks the last 5 opened documents per project in sessionStorage.
 * Most recently opened documents appear first, deduplicated by documentId.
 *
 * @param projectId The current project identifier used to scope the storage key.
 * @returns recentDocuments and an addRecentDocument callback.
 */
export const useRecentDocuments = (projectId: string) => {
  const storageKey = `${RECENT_DOCUMENTS_STORAGE_PREFIX}${projectId || 'global'}`;
  const [recentDocuments, setRecentDocuments] = useLocalStorage({
    key: storageKey,
    storage: 'session',
    initialValue: EMPTY_RECENT_DOCUMENTS,
    schema: recentDocumentsSchema,
  });

  const addRecentDocument = (documentId: string) => {
    setRecentDocuments((prev) => {
      const filtered = prev.filter((entry) => entry.documentId !== documentId);
      return [{ documentId }, ...filtered].slice(0, MAX_RECENT_DOCUMENTS);
    });
  };

  return { recentDocuments, addRecentDocument };
};
