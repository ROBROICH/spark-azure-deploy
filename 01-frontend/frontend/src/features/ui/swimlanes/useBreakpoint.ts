import { useSyncExternalStore } from 'react';

import type { SwimlanesBreakpointToken } from './swimlanes.types';
import { SWIMLANE_BREAKPOINTS } from './swimlanes.types';

/**
 * Returns `true` when the viewport matches the given breakpoint token.
 *
 * Uses `window.matchMedia` with `useSyncExternalStore` for tear-free reads
 * and a single listener to avoid layout thrashing.
 *
 * When no token is provided, returns `false`.
 */
export const useBreakpoint = (
  token: SwimlanesBreakpointToken | undefined,
): boolean => {
  const query = token ? SWIMLANE_BREAKPOINTS[token] : undefined;

  return useSyncExternalStore(
    (callback) => {
      if (!query) {
        return () => {};
      }

      const mql = window.matchMedia(query);
      mql.addEventListener('change', callback);

      return () => {
        mql.removeEventListener('change', callback);
      };
    },
    () => {
      if (!query) {
        return false;
      }
      return window.matchMedia(query).matches;
    },
    // Server snapshot: always false (collapsed)
    () => false,
  );
};
