import { cleanup, render, screen } from '@testing-library/react';
import { createElement, useEffect, useState, type ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route as DashboardRoute } from '@/routes/index';
import { Route as ProjectsListRoute } from '@/routes/verfahren/index';

type ProjectsOverviewRoute = {
  component: ComponentType;
  loader: () => Promise<void>;
  pendingComponent: ComponentType;
  pendingMs: number;
};

type Deferred = {
  reject: (reason?: unknown) => void;
  promise: Promise<void>;
  resolve: () => void;
};

const dashboardRoute = DashboardRoute as unknown as ProjectsOverviewRoute;
const projectsListRoute = ProjectsListRoute as unknown as ProjectsOverviewRoute;

const createDeferred = (): Deferred => {
  let rejectDeferred: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise rejected before initialization');
  };
  let resolveDeferred: () => void = () => {
    throw new Error('Deferred promise resolved before initialization');
  };
  const promise = new Promise<void>((resolve, reject) => {
    rejectDeferred = reject;
    resolveDeferred = resolve;
  });

  return {
    reject: rejectDeferred,
    promise,
    resolve: resolveDeferred,
  };
};

function TestRouteHarness(props: { route: ProjectsOverviewRoute }) {
  const { route } = props;
  // eslint-disable-next-line no-restricted-syntax -- Test-only mount readiness is ephemeral harness state.
  const [isReady, setIsReady] = useState(false);

  // eslint-disable-next-line no-restricted-syntax -- The harness starts the async route loader after mount.
  useEffect(() => {
    let isMounted = true;

    void route.loader().then(() => {
      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [route]);

  if (!isReady) {
    return createElement(route.pendingComponent);
  }

  return createElement(route.component);
}

const mocks = vi.hoisted(() => ({
  organizationUsersDeferred: undefined as Deferred | undefined,
  preloadOrganizationUsers: vi.fn(() => {
    const deferred = mocks.organizationUsersDeferred;

    if (!deferred) {
      throw new Error('Organization users deferred promise is missing');
    }

    return deferred.promise;
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock('@/features/main-page/dashboard-screen/DashboardScreen', () => ({
  DashboardScreen: () => createElement('div', null, 'Dashboard screen'),
}));

vi.mock('@/features/main-page/list-screen/ListScreen', () => ({
  ListScreen: () => createElement('div', null, 'Projects list screen'),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  CurrentUserLoadingScreen: () =>
    createElement('div', null, 'Current user loading'),
}));

vi.mock(
  '@/features/access-control/organization-users/organizationUsers.collection',
  () => ({
    organizationUsersCollection: {
      preload: mocks.preloadOrganizationUsers,
    },
  }),
);

describe('projects overview routes', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.organizationUsersDeferred = createDeferred();
    mocks.preloadOrganizationUsers.mockClear();
  });

  it.each([
    ['dashboard', dashboardRoute],
    ['projects list', projectsListRoute],
  ])(
    'uses the current-user loading screen immediately while the %s loader is pending',
    async (_name, route) => {
      render(createElement(TestRouteHarness, { route }));

      expect(screen.queryByText('Dashboard screen')).toBeNull();
      expect(screen.queryByText('Projects list screen')).toBeNull();
      expect(route.pendingMs).toBe(0);
      expect(screen.getByText('Current user loading')).toBeDefined();

      mocks.organizationUsersDeferred?.resolve();
      await screen.findByText(
        route === dashboardRoute ? 'Dashboard screen' : 'Projects list screen',
      );
    },
  );

  it.each([
    ['dashboard', dashboardRoute, 'Dashboard screen'],
    ['projects list', projectsListRoute, 'Projects list screen'],
  ])(
    'keeps the %s screen available when organization users fail',
    async (_name, route, expectedText) => {
      render(createElement(TestRouteHarness, { route }));

      mocks.organizationUsersDeferred?.reject(new Error('people unavailable'));

      await screen.findByText(expectedText);
    },
  );
});
