import { useRef } from 'react';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';

const PAGE_POSITIONS_STORAGE_PREFIX = 'pdf-popout-page-positions:';

const pagePositionsSchema = z.record(z.string(), z.number());

type PagePositions = z.infer<typeof pagePositionsSchema>;

const EMPTY_PAGE_POSITIONS: PagePositions = {};

/**
 * Persists per-document page positions in sessionStorage so users return to
 * where they left off when reopening a document.
 *
 * @param projectId The current project identifier used to scope the storage key.
 * @returns getPagePosition and savePagePosition helpers.
 */
export const usePagePositions = (projectId: string) => {
  const storageKey = `${PAGE_POSITIONS_STORAGE_PREFIX}${projectId || 'global'}`;
  const [positions, setPositions] = useLocalStorage({
    key: storageKey,
    storage: 'session',
    initialValue: EMPTY_PAGE_POSITIONS,
    schema: pagePositionsSchema,
  });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPagePosition = (documentId: string): number | undefined =>
    positions[documentId];

  const savePagePosition = (documentId: string, pageNumber: number) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setPositions((prev) => ({ ...prev, [documentId]: pageNumber }));
    }, 300);
  };

  return { getPagePosition, savePagePosition };
};
