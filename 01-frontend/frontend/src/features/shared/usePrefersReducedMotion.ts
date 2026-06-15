import { useSyncExternalStore } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (callback) => {
      const mediaQueryList = window.matchMedia(reducedMotionQuery);
      mediaQueryList.addEventListener('change', callback);

      return () => {
        mediaQueryList.removeEventListener('change', callback);
      };
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}
