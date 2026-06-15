import { useSyncExternalStore } from 'react';

const LARGE_SCREEN_QUERY = '(min-width: 1600px)';
const LARGE_SCREEN_MAX = 2;
const SMALL_SCREEN_MAX = 1;

const getSnapshot = (mql: MediaQueryList) =>
  mql.matches ? LARGE_SCREEN_MAX : SMALL_SCREEN_MAX;

const fallbackMax = LARGE_SCREEN_MAX;

/**
 * Returns the maximum number of manual (non-connected) panes allowed based on
 * the popup window width. Must receive the popup window reference so the media
 * query runs against the correct viewport.
 *
 * @param ownerWindow The popup window (from popupRoot.ownerDocument.defaultView).
 * @returns 2 for large screens (>= 1600px), 1 for smaller.
 */
export const useMaxManualLanes = (ownerWindow?: Window | null): number => {
  const mql = ownerWindow?.matchMedia(LARGE_SCREEN_QUERY) ?? null;

  return useSyncExternalStore(
    (onStoreChange) => {
      if (!mql) {
        return () => {};
      }

      mql.addEventListener('change', onStoreChange);

      return () => {
        mql.removeEventListener('change', onStoreChange);
      };
    },
    () => (mql ? getSnapshot(mql) : fallbackMax),
    () => fallbackMax,
  );
};
