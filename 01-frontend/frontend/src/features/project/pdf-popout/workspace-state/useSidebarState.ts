import { useState } from 'react';

export type DocumentFilter = 'all' | 'topic';

/**
 * Owns sidebar open/close state and document filter selection for the popout
 * workspace. Exposes setters so scope registration can restore cached values.
 *
 * Tree filtering and document counts are derived in the workspace composer
 * because they depend on topic metadata from scope registration, which
 * initialises after this hook.
 *
 * @returns Sidebar state, filter state, and setters.
 */
export const useSidebarState = () => {
  // eslint-disable-next-line no-restricted-syntax -- sidebarOpen is scoped to the popout workspace and persisted per-scope, not URL state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // eslint-disable-next-line no-restricted-syntax -- documentFilter is scoped to the popout workspace and persisted per-scope, not URL state
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>('all');

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  return {
    sidebarOpen,
    setSidebarOpen,
    documentFilter,
    setDocumentFilter,
    toggleSidebar,
  };
};
