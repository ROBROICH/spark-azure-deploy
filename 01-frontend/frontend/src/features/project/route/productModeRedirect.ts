import { redirect } from '@tanstack/react-router';

import { getConfiguredProductMode } from '@/features/shared/config/productMode';

/**
 * Redirects an excluded process-step route to the same procedure's EWMS page
 * when the EWMS-only product mode is active. Returns without throwing in SPARK
 * mode so the route loads normally.
 */
export const redirectExcludedStepToEwms = (verfahrenId: string): void => {
  if (getConfiguredProductMode() !== 'ewms') {
    return;
  }

  throw redirect({
    to: '/verfahren/$verfahrenId/ewms',
    params: { verfahrenId },
    // Canonical empty EWMS search: never carry over query params from the
    // excluded step route (e.g. fvp/rpb search state is not valid here).
    search: { objectionsFilter: undefined },
    replace: true,
  });
};
