import { ErrorBoundary } from '@/features/shared/error-states/ErrorBoundary';
import { getAppBasePath } from '@/features/shared/config/appBasePath';
import { NotFound } from '@/features/shared/error-states/NotFound';
import { routeTree } from '@/routeTree.gen';
import { refetchProjectNodeTreeAndPayloads } from '@/db/nodes/collections/reloadProjectNodeTreeAndPayloads';
import type { ParsedLocation } from '@tanstack/react-router';
import { createRouter } from '@tanstack/react-router';
import * as TanStackQueryProvider from '../tanstack-query/root-provider.tsx';
import { setRegisteredRouter } from './registeredRouter';
import { configureExperimentalRouteRemount } from './routeRemount';

const TanStackQueryProviderContext = TanStackQueryProvider.getContext();

export const router = createRouter({
  routeTree,
  basepath: getAppBasePath(),
  context: {
    ...TanStackQueryProviderContext,
    previousLocation: undefined as ParsedLocation | undefined,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: () => <NotFound />,
  defaultErrorComponent: ({ error }) => (
    <ErrorBoundary
      error={error instanceof Error ? error : new Error(String(error))}
    />
  ),
});

// Register the router so non-component modules (e.g. the version-conflict event
// validator) can read live router state without statically importing this module.
setRegisteredRouter(router);

router.subscribe('onBeforeLoad', ({ fromLocation }) => {
  // Preserve the previous resolved location so loaders can distinguish
  // cold URL entries from internal SPA navigations.
  router.options.context.previousLocation = fromLocation;
});

configureExperimentalRouteRemount({
  queryClient: TanStackQueryProviderContext.queryClient,
  refetchProjectNodeTreeAndPayloads,
  router,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { TanStackQueryProviderContext };
