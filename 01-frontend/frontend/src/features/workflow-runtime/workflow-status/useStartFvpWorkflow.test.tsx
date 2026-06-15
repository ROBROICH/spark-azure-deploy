import { act, cleanup, renderHook } from '@testing-library/react';
import type * as TanstackReactQuery from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStartFvpWorkflow } from './useStartFvpWorkflow';

const mocks = vi.hoisted(() => ({
  canMutateProject: true,
  invalidateQueries: vi.fn(() => Promise.resolve()),
  mutateAsync: vi.fn(() => Promise.resolve({ parentJobId: 'fvp-workflow-1' })),
  observeStarted: vi.fn(() => Promise.resolve()),
  toastSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactQuery>();

  return {
    ...actual,
    useMutation: () => ({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    }),
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock('./useRunningWorkflow', () => ({
  WORKFLOW_TYPE_FVP: 'FVPWorkflow',
  useRunningWorkflow: () => ({
    observeStarted: mocks.observeStarted,
  }),
}));

vi.mock(
  '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen',
  () => ({
    orchestrateFvpWorkflowWorkflowsFormalePruefungPostMutation: vi.fn(
      () => ({}),
    ),
  }),
);

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    success: mocks.toastSuccess,
  },
}));

afterEach(() => {
  cleanup();
  mocks.canMutateProject = true;
  mocks.invalidateQueries.mockClear();
  mocks.mutateAsync.mockClear();
  mocks.observeStarted.mockClear();
  mocks.toastSuccess.mockClear();
});

describe('useStartFvpWorkflow', () => {
  it('starts FVP and refreshes project data after observing the workflow', async () => {
    const { result } = renderHook(() => useStartFvpWorkflow('project-1'));

    await act(async () => {
      await result.current.startFvpWorkflow();
    });

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      body: {
        project_id: 'project-1',
      },
    });
    expect(mocks.observeStarted).toHaveBeenCalledOnce();
    expect(mocks.observeStarted).toHaveBeenCalledWith('fvp-workflow-1');
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects'],
    });
  });

  it('fails closed without project mutation rights', async () => {
    mocks.canMutateProject = false;
    const { result } = renderHook(() => useStartFvpWorkflow('project-1'));

    await expect(result.current.startFvpWorkflow()).rejects.toThrow(
      'Missing project mutation rights',
    );

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.observeStarted).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
});
