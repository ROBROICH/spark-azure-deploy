import { createFileRoute, redirect } from '@tanstack/react-router';
import { getLegacyPlausibilityCheckRedirect } from '@/features/project/route/legacyPlausibilityCheckRoute';

/**
 * Legacy redirect route for /verfahren/$verfahrenId/pp
 *
 * The Plausibility Check (PP) page has been moved under the FVP tabbed layout.
 * This redirect ensures deep links and bookmarks to the old path continue to work.
 */
export const Route = createFileRoute('/verfahren/$verfahrenId/pp/')({
  beforeLoad: ({ params }) => {
    throw redirect(getLegacyPlausibilityCheckRedirect(params.verfahrenId));
  },
});
