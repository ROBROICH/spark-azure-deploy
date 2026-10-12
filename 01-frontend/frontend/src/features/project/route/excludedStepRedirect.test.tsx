import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import type { ParsedLocation } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

// The real route files import their full layout stacks; only their beforeLoad
// guards are under test, so heavy children stay stubbed.
vi.mock('@/features/project/route-navbar/ProjectNavbar', () => ({
  ProjectNavbar: () => null,
}));
vi.mock('@/features/project/route-navbar/ProjectNavbarSkeleton', () => ({
  ProjectNavbarSkeleton: () => null,
}));
vi.mock(
  '@/features/workflow-runtime/workflow-status/FvpWorkflowContext',
  () => ({
    FvpWorkflowProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useFvpWorkflowContext: () => ({
      tableOfContentsWorkflow: { isLoading: false },
      plausibilityWorkflow: { isLoading: false },
      requiredDocumentsWorkflow: { isLoading: false },
    }),
  }),
);
vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {},
}));
vi.mock('@/features/project/nachforderungen/NachforderungenPage', () => ({
  NachforderungenPage: () => null,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Dynamic imports are required: the product-mode snapshot is cached on first
// read, so the route modules must load only after __APP_CONFIG__ is set.
const { Route: FvpRoute } =
  await import('@/routes/verfahren/$verfahrenId/fvp/route');
const { Route: MvpRoute } =
  await import('@/routes/verfahren/$verfahrenId/mvp/route');
const { Route: RpbRoute } =
  await import('@/routes/verfahren/$verfahrenId/rpb/route');
const { Route: PpRoute } =
  await import('@/routes/verfahren/$verfahrenId/pp/index');
const { Route: NachforderungenRoute } =
  await import('@/routes/verfahren/$verfahrenId/nachforderungen/index');

const childLoader = vi.fn(() => ({ loaded: true }));

afterEach(() => {
  cleanup();
  childLoader.mockClear();
});

type ExcludedPath =
  | '/verfahren/$verfahrenId/fvp'
  | '/verfahren/$verfahrenId/mvp'
  | '/verfahren/$verfahrenId/rpb'
  | '/verfahren/$verfahrenId/pp'
  | '/verfahren/$verfahrenId/nachforderungen';

type ProcedureBeforeLoadContext = {
  params: { verfahrenId: string };
};

type ExcludedRouteCase = {
  name: string;
  path: ExcludedPath;
  beforeLoad: (context: ProcedureBeforeLoadContext) => unknown;
};

function adaptBeforeLoad<TContext extends ProcedureBeforeLoadContext>(
  beforeLoad: ((context: TContext) => unknown) | undefined,
): ExcludedRouteCase['beforeLoad'] {
  if (!beforeLoad) {
    throw new Error('Expected the production route to define beforeLoad');
  }

  return (context) => beforeLoad(context as TContext);
}

const excludedRoutes: ExcludedRouteCase[] = [
  {
    name: 'fvp',
    path: '/verfahren/$verfahrenId/fvp',
    beforeLoad: adaptBeforeLoad(FvpRoute.options.beforeLoad),
  },
  {
    name: 'mvp',
    path: '/verfahren/$verfahrenId/mvp',
    beforeLoad: adaptBeforeLoad(MvpRoute.options.beforeLoad),
  },
  {
    name: 'rpb',
    path: '/verfahren/$verfahrenId/rpb',
    beforeLoad: adaptBeforeLoad(RpbRoute.options.beforeLoad),
  },
  {
    name: 'pp',
    path: '/verfahren/$verfahrenId/pp',
    beforeLoad: adaptBeforeLoad(PpRoute.options.beforeLoad),
  },
  {
    name: 'nachforderungen',
    path: '/verfahren/$verfahrenId/nachforderungen',
    beforeLoad: adaptBeforeLoad(NachforderungenRoute.options.beforeLoad),
  },
];

async function renderGuardedRoute({ path, beforeLoad }: ExcludedRouteCase) {
  const rootRoute = createRootRouteWithContext<{
    queryClient: QueryClient;
    previousLocation?: ParsedLocation;
  }>()({ component: Outlet });
  const ewmsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/ewms',
    component: () => <div>EWMS page</div>,
  });
  // A typed adapter attaches the production callback to a lightweight route at
  // the same path; the child loader proves whether the guard ran first.
  const excludedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: (context) => beforeLoad(context),
    component: Outlet,
  });
  const excludedChildRoute = createRoute({
    getParentRoute: () => excludedRoute,
    path: '/child',
    loader: childLoader,
    component: () => <div>excluded child content</div>,
  });
  const routeTree = rootRoute.addChildren([
    ewmsRoute,
    excludedRoute.addChildren([excludedChildRoute]),
  ]);
  const history = createMemoryHistory({
    initialEntries: [
      `/verfahren/test-project${path.replace('/verfahren/$verfahrenId', '')}/child`,
    ],
  });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient: new QueryClient() },
  });

  render(<RouterProvider router={router} />);
  await router.load();

  return router;
}

describe('excluded step routes in EWMS-only product mode', () => {
  it.each(excludedRoutes)(
    '$name redirects to the same procedure EWMS page before loading children',
    async (routeCase) => {
      const router = await renderGuardedRoute(routeCase);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(
          '/verfahren/test-project/ewms',
        );
      });
      expect(screen.getByText('EWMS page')).toBeTruthy();
      expect(childLoader).not.toHaveBeenCalled();
      expect(screen.queryByText('excluded child content')).toBeNull();
    },
  );
});
