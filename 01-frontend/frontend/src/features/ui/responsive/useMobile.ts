import { useSyncExternalStore } from 'react';

// Keep in sync with Tailwind `md` / `lg` in `styles.css`.
const MOBILE_BREAKPOINT = 768;
const LG_BREAKPOINT = 1024;
const mobileQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
const belowLgQuery = `(max-width: ${LG_BREAKPOINT - 1}px)`;

const subscribeToQuery = (query: string) => (cb: () => void) => {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};

export function useMobile() {
  return useSyncExternalStore(
    subscribeToQuery(mobileQuery),
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
}

/**
 * Returns `true` when viewport is narrower than Tailwind `lg` (1024px).
 * Use for toolbars that overflow around ~1000px and should collapse earlier
 * than `useMobile`.
 */
export function useBelowLg() {
  return useSyncExternalStore(
    subscribeToQuery(belowLgQuery),
    () => window.matchMedia(belowLgQuery).matches,
    () => false,
  );
}
