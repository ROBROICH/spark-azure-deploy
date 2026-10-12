import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TanstackReactDb from '@tanstack/react-db';
import type * as TanstackReactQuery from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type * as ProjectsCollectionModule from '@/features/project/data/collections/projects.collection';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

const mocks = vi.hoisted(() => ({
  canDeleteProject: false,
  deleteProject: vi.fn(() => Promise.resolve()),
  deleteProjectMutationPending: false,
  invalidateQueries: vi.fn(() => Promise.resolve()),
  mutateAsync: vi.fn(() => Promise.resolve({ parentJobId: 'fvp-workflow-1' })),
  observeStartedWorkflow: vi.fn(() => Promise.resolve()),
  removeFavorite: vi.fn(),
  refetchSystemLoad: vi.fn(),
  systemLoadError: false,
  systemLoadHigh: false,
  systemLoadLoading: false,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const value: Record<string, string> = {
        'projectNavbar.startProcess': 'Start review process',
        'projectNavbar.goToProject': 'Go to project',
        'projectNavbar.favoriteProject': 'Mark as favorite',
        'projectNavbar.unfavoriteProject': 'Remove from favorites',
        'projectNavbar.actionsMenuLabel': 'More actions',
        'projectNavbar.deleteProject': 'Delete project',
        'projectNavbar.deleteProjectConfirmTitle': 'Delete project?',
        'projectNavbar.deleteProjectConfirmDescription':
          'Do you really want to delete "{{projectName}}"? This action is permanent and cannot be undone.',
        'projectNavbar.deleteCancel': 'Cancel delete',
        'projectNavbar.deleteConfirm': 'Delete',
        'projectNavbar.deleteProjectSuccess':
          'Project "{{projectName}}" was deleted.',
        'projectNavbar.deleteProjectError':
          'Project could not be deleted. Please try again.',
        'projectNavbar.startProcessConfirmTitle':
          'Start AI processing of the documents',
        'projectNavbar.startProcessConfirmDescription':
          'Starting the processing will trigger the workflow.',
        'projectNavbar.startProcessCancel': 'Cancel',
        'projectNavbar.startProcessConfirm': 'Start processing',
        'projectNavbar.startProcessDisabledBySystemLoad':
          'System load is too high.',
        'sidebar.systemLoad.error': 'System load is unavailable.',
        'sidebar.systemLoad.loading': 'Loading system load...',
        'projectNavbar.startProcessError': 'Could not start the workflow.',
      };

      return (value[key] ?? key).replace(
        '{{projectName}}',
        params?.projectName ?? '',
      );
    },
  }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactQuery>();

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
    useMutation: () => ({
      mutateAsync: mocks.mutateAsync,
      isPending: mocks.deleteProjectMutationPending,
    }),
  };
});

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanDeleteProject',
  () => ({
    useCanDeleteProject: () => ({
      canDeleteProject: mocks.canDeleteProject,
    }),
  }),
);

vi.mock('@/api-clients/backend/@tanstack/react-query.gen', () => ({
  v1AgentOrchestrationStartFormalCompletenessWorkflowMutation: vi.fn(
    () => ({}),
  ),
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    WORKFLOW_TYPE_FVP: 'FVPWorkflow',
    useRunningWorkflow: () => ({
      observeStarted: mocks.observeStartedWorkflow,
    }),
  }),
);

vi.mock('@/features/project/data/project-favorites/useFavorites', () => ({
  MAX_FAVORITES: 8,
  useFavorites: () => ({
    canFavorite: true,
    isFavorite: () => false,
    remove: mocks.removeFavorite,
    toggle: mocks.toggleFavorite,
  }),
}));

vi.mock('@/features/workflow-runtime/system-load/useSystemLoad', () => ({
  useSystemLoad: () => ({
    data: undefined,
    isError: mocks.systemLoadError,
    isFetching: false,
    isLoading: mocks.systemLoadLoading,
    isSystemLoadHigh: mocks.systemLoadHigh,
    refetch: mocks.refetchSystemLoad,
  }),
}));

vi.mock('@/features/project/project-entry/useProjectEntryAction', () => ({
  useProjectEntryAction: () => ({
    hasStartedFvpProcess: false,
    isProjectEntryActionLoading: false,
  }),
}));

vi.mock(
  '@/features/project/data/collections/projects.collection',
  async (importOriginal) => {
    const actual = await importOriginal<typeof ProjectsCollectionModule>();

    return {
      ...actual,
      projectsCollection: {
        ...actual.projectsCollection,
        utils: {
          ...actual.projectsCollection.utils,
          deleteProject: mocks.deleteProject,
        },
      },
    };
  },
);

vi.mock('@tanstack/react-db', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactDb>();

  return {
    ...actual,
    eq: vi.fn(),
    useLiveQuery: (
      query: (builder: {
        from: (sources: Record<string, unknown>) => {
          where: (_callback: unknown) => unknown;
        };
      }) => unknown,
    ) => {
      let sources: Record<string, unknown> | undefined;

      query({
        from: (nextSources) => {
          sources = nextSources;

          return {
            where: () => ({}),
          };
        },
      });

      if (sources && 'projects' in sources) {
        return {
          data: [{ id: 'test-project', name: 'A39 Neubau' }],
          isLoading: false,
        };
      }

      if (sources && 'files' in sources) {
        return {
          data: [{ id: 'file-1', projectId: 'test-project' }],
          isLoading: false,
        };
      }

      return {
        data: [],
        isLoading: false,
      };
    },
  };
});

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the component must load only after __APP_CONFIG__ is set.
const { ProjectOverviewNavbarSection } =
  await import('./ProjectOverviewNavbarSection');

afterEach(() => {
  cleanup();
});

const overviewSearchSchema = z.object({
  showStartProcessDialog: z.boolean().optional(),
});

async function renderWithRouter() {
  const rootRoute = createRootRoute({ component: Outlet });
  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/',
    validateSearch: overviewSearchSchema,
    component: OverviewRouteComponent,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home page</div>,
  });
  const ewmsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/ewms',
    component: () => <div>EWMS page</div>,
  });
  const routeTree = rootRoute.addChildren([
    homeRoute,
    overviewRoute,
    ewmsRoute,
  ]);
  const history = createMemoryHistory({
    initialEntries: ['/verfahren/test-project/'],
  });
  const router = createRouter({ routeTree, history });

  render(<RouterProvider router={router} />);
  await router.load();

  return router;

  function OverviewRouteComponent() {
    const { verfahrenId } = overviewRoute.useParams();

    return <ProjectOverviewNavbarSection verfahrenId={verfahrenId} />;
  }
}

describe('ProjectOverviewNavbarSection in EWMS-only product mode', () => {
  it('navigates to the EWMS route when the procedure link is clicked', async () => {
    const user = userEvent.setup();
    const router = await renderWithRouter();

    await user.click(screen.getByRole('link', { name: 'Go to project' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        '/verfahren/test-project/ewms',
      );
    });
  });
});
