import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureExperimentalRouteRemount,
  experimentalRouteRemount,
} from './routeRemount';

const mocks = vi.hoisted(() => ({
  createRouter: vi.fn(),
  queryClient: {},
  refetchProjectNodeTreeAndPayloads: vi.fn(),
  setRegisteredRouter: vi.fn(),
}));

vi.mock('@/db/nodes/collections/reloadProjectNodeTreeAndPayloads', () => ({
  refetchProjectNodeTreeAndPayloads: mocks.refetchProjectNodeTreeAndPayloads,
}));

describe('router', () => {
  afterEach(() => {
    vi.doUnmock('@tanstack/react-router');
    vi.doUnmock('@/features/shared/config/appBasePath');
    vi.doUnmock('@/routeTree.gen');
    vi.doUnmock('@/features/shared/error-states/ErrorBoundary');
    vi.doUnmock('@/features/shared/error-states/NotFound');
    vi.doUnmock('../tanstack-query/root-provider.tsx');
    vi.doUnmock('./registeredRouter');
    vi.doUnmock('./routeRemount');
    vi.resetModules();
    vi.clearAllMocks();
    delete window.__APP_CONFIG__;
  });

  it('configures TanStack Router with the runtime app base path', async () => {
    vi.resetModules();
    const router = {
      clearCache: vi.fn(),
      options: {},
      state: { location: {}, matches: [] },
      subscribe: vi.fn(),
    };
    mocks.createRouter.mockReturnValue(router);
    window.__APP_CONFIG__ = {
      VITE_APP_BASE_PATH: '/custom-app',
    };

    vi.doMock('@tanstack/react-router', () => ({
      createRouter: mocks.createRouter,
    }));
    vi.doMock('@/routeTree.gen', () => ({
      routeTree: {},
    }));
    vi.doMock('@/features/shared/error-states/ErrorBoundary', () => ({
      ErrorBoundary: () => null,
    }));
    vi.doMock('@/features/shared/error-states/NotFound', () => ({
      NotFound: () => null,
    }));
    vi.doMock('../tanstack-query/root-provider.tsx', () => ({
      getContext: () => ({
        queryClient: mocks.queryClient,
      }),
    }));
    vi.doMock('./registeredRouter', () => ({
      setRegisteredRouter: mocks.setRegisteredRouter,
    }));
    vi.doMock('./routeRemount', () => ({
      configureExperimentalRouteRemount: vi.fn(),
    }));

    await import('./router');

    expect(mocks.createRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        basepath: '/custom-app',
      }),
    );
  });
});

describe('experimentalRouteRemount', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears project route cache, refreshes node collections, and returns after an invalidation rejects', async () => {
    const invalidateError = new Error('project list failed');
    const queryClient = {
      invalidateQueries: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(invalidateError)
        .mockResolvedValueOnce(undefined),
    };
    const router = {
      clearCache: vi.fn(),
      navigate: vi.fn().mockResolvedValue(undefined),
      options: {
        basepath: '/app',
      },
      state: {
        location: {
          hash: '#details',
          pathname: '/app/verfahren/project-1/mvp',
          search: { tab: 'overview' },
        },
        matches: [
          {
            loaderData: {
              projectVersion: 7,
            },
            params: {
              verfahrenId: 'project-1',
            },
          },
        ],
      },
    };
    mocks.refetchProjectNodeTreeAndPayloads.mockResolvedValue(undefined);

    configureExperimentalRouteRemount({
      queryClient: queryClient as never,
      refetchProjectNodeTreeAndPayloads:
        mocks.refetchProjectNodeTreeAndPayloads,
      router: router as never,
    });

    await experimentalRouteRemount('project-1');

    expect(router.navigate).toHaveBeenNthCalledWith(1, {
      to: '/route-remount',
      replace: true,
      resetScroll: false,
    });
    expect(router.clearCache).toHaveBeenCalledTimes(1);
    expect(
      router.clearCache.mock.calls[0]?.[0].filter({
        params: { verfahrenId: 'project-1' },
      }),
    ).toBe(true);
    expect(mocks.refetchProjectNodeTreeAndPayloads).toHaveBeenCalledWith(
      'project-1',
      7,
    );
    expect(router.navigate).toHaveBeenNthCalledWith(2, {
      to: '/verfahren/project-1/mvp',
      search: { tab: 'overview' },
      hash: '#details',
      replace: true,
      resetScroll: false,
    });
  });
});
