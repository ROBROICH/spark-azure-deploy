import { describe, expect, it, vi } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

const mocks = vi.hoisted(() => ({
  initializeProject: vi.fn(() => Promise.resolve({ data: {} })),
  startBatchMvpWorkflow: vi.fn(() => Promise.resolve({ data: {} })),
  fetchProject: vi.fn(),
  fetchCurrentUser: vi.fn(() =>
    Promise.resolve({ role: 'admin', userId: 'user-1' }),
  ),
  preloadOrganizationUsers: vi.fn(() => Promise.resolve()),
  preloadNodes: vi.fn(() => Promise.resolve()),
  nodesState: new Map(),
  toastError: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1AgentOrchestrationStartBatchMvpWorkflow: mocks.startBatchMvpWorkflow,
  v1ProjectLogicInitializeProject: mocks.initializeProject,
}));

vi.mock('@/db/nodes/createExaminationDb', () => ({
  createExaminationDb: () => ({
    nodesCollection: {
      preload: mocks.preloadNodes,
      state: mocks.nodesState,
      utils: { refetch: vi.fn() },
    },
  }),
}));

vi.mock('@/db/nodes/projectGraphCache', () => ({
  ensureProjectGraphReady: async (
    _collection: unknown,
    load: () => Promise<unknown>,
  ) => load(),
}));

vi.mock('@/features/access-control/current-user/currentUser', () => ({
  getCurrentUserQueryOptions: () => ({ queryKey: ['current-user'] }),
}));

vi.mock(
  '@/features/access-control/organization-users/organizationUsers.collection',
  () => ({
    organizationUsersCollection: {
      preload: mocks.preloadOrganizationUsers,
    },
  }),
);

vi.mock(
  '@/features/access-control/project-permissions/isProjectOwnerOrMember',
  () => ({
    isProjectOwnerOrMember: () => true,
  }),
);

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  projectsCollection: {
    utils: { fetchProject: mocks.fetchProject },
  },
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  getProjectLatestVersion: () => 1,
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: mocks.toastError },
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/projectTemporalWorkflows.collection',
  () => ({
    getProjectTemporalWorkflowsManager: () => ({}),
  }),
);

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: { fetchQuery: mocks.fetchCurrentUser },
}));

vi.mock('i18next', () => ({
  default: { t: (key: string) => key },
}));

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the loader must load only after __APP_CONFIG__ is set.
const { projectRouteLoader } = await import('./projectRouteLoader');

describe('projectRouteLoader in EWMS-only product mode', () => {
  it('initializes the project without starting the MVP batch workflow', async () => {
    mocks.fetchProject.mockResolvedValue({ id: 'p1', name: 'Test' });

    await projectRouteLoader({ params: { verfahrenId: 'p1' } });

    expect(mocks.initializeProject).toHaveBeenCalledTimes(1);
    expect(mocks.startBatchMvpWorkflow).not.toHaveBeenCalled();
  });

  it('propagates a missing project as a loader error before initialization', async () => {
    mocks.fetchProject.mockRejectedValue(new Error('not found'));
    mocks.initializeProject.mockClear();

    await expect(
      projectRouteLoader({ params: { verfahrenId: 'missing' } }),
    ).rejects.toThrow('not found');
    expect(mocks.initializeProject).not.toHaveBeenCalled();
    expect(mocks.startBatchMvpWorkflow).not.toHaveBeenCalled();
  });
});
