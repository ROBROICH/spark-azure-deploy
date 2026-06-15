import { useCallback, useRef } from 'react';
import { z } from 'zod';
import type { PdfPane } from '../pdfPopout.logic';

const SCOPE_CACHE_KEY = 'pdf-popout-scope-cache';

const cachedScopeStateSchema = z.object({
  scopeKey: z.string(),
  projectId: z.string(),
  panes: z.array(
    z.object({
      id: z.string(),
      documentId: z.string().optional(),
      connected: z.boolean(),
    }),
  ),
  sidebarOpen: z.boolean(),
  documentFilter: z.enum(['all', 'topic']),
});

type CachedScopeState = z.infer<typeof cachedScopeStateSchema>;

const cacheSchema = z.record(z.string(), cachedScopeStateSchema);

const readCache = (): Record<string, CachedScopeState> => {
  try {
    const raw = window.sessionStorage.getItem(SCOPE_CACHE_KEY);
    if (!raw) {
      return {};
    }

    return cacheSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, CachedScopeState>) => {
  try {
    window.sessionStorage.setItem(SCOPE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently ignore storage quota errors.
  }
};

type ScopePersistenceState = {
  panes: PdfPane[];
  sidebarOpen: boolean;
  documentFilter: 'all' | 'topic';
};

/**
 * Provides scope-level state caching in sessionStorage so the popout window can
 * restore pane layout, sidebar visibility, and document filter when the user
 * navigates back to a previously visited scope.
 */
export const useScopePersistence = () => {
  const cacheRef = useRef(readCache());

  // eslint-disable-next-line no-restricted-syntax -- these callbacks are exposed through context and consumed by effect-driven scope registration, so they must keep a stable identity
  const cacheScope = useCallback(
    (scopeKey: string, projectId: string, state: ScopePersistenceState) => {
      const cache = { ...cacheRef.current };
      cache[scopeKey] = {
        scopeKey,
        projectId,
        panes: state.panes,
        sidebarOpen: state.sidebarOpen,
        documentFilter: state.documentFilter,
      };
      cacheRef.current = cache;
      writeCache(cache);
    },
    [],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable identity required for effect-driven scope registration
  const restoreScope = useCallback(
    (scopeKey: string): CachedScopeState | null => {
      const cache = readCache();
      cacheRef.current = cache;
      return cache[scopeKey] ?? null;
    },
    [],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable identity required for effect-driven scope registration
  const clearCachedScope = useCallback((scopeKey: string) => {
    const cache = { ...cacheRef.current };
    delete cache[scopeKey];
    cacheRef.current = cache;
    writeCache(cache);
  }, []);

  return { cacheScope, restoreScope, clearCachedScope };
};
