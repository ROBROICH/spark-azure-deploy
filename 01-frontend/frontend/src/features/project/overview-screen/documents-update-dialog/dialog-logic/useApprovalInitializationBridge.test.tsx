import type { ZipApprovalStatus, ZipFileResponse } from '@/api-clients/backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseApprovalInitializationBridgeParams } from './useApprovalInitializationBridge';
import { useApprovalInitializationBridge } from './useApprovalInitializationBridge';

const mocks = vi.hoisted(() => ({
  experimentalRouteRemount: vi.fn(),
  refetchRunning: vi.fn(),
}));

vi.mock('@/integrations/router/routeRemount', () => ({
  experimentalRouteRemount: mocks.experimentalRouteRemount,
}));

const makeWrapper = (queryClient: QueryClient) => {
  return (props: { children: React.ReactNode }) => {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      props.children,
    );
  };
};

const makeParams = (
  overrides: Partial<UseApprovalInitializationBridgeParams> = {},
): UseApprovalInitializationBridgeParams => ({
  canMutateProject: true,
  processingFiles: [],
  phase: 'uploading',
  zipFileId: 'zip-1',
  projectId: 'project-1',
  verfahrenId: 'project-1',
  workflowsManager: {
    refetchRunning: mocks.refetchRunning,
  },
  terminalStatus: 'COMPLETED',
  terminalApprovalStatus: null,
  setPhase: vi.fn(),
  setProjectId: vi.fn(),
  setZipFileId: vi.fn(),
  setMinimized: vi.fn(),
  setGlobalError: vi.fn(),
  setUploadErrorDetails: vi.fn(),
  resetFiles: vi.fn(),
  ...overrides,
});

const makeZipFile = (approvalStatus: ZipApprovalStatus): ZipFileResponse => ({
  approvalStatus,
  approvalError: null,
  workflowFailureCode: null,
  sourceProjectVersion: null,
  bucketPath: 'zip-1.zip',
  createdAt: '2026-06-03T10:00:00.000Z',
  filename: 'zip-1.zip',
  id: 'zip-1',
  projectId: 'project-1',
  type: 'zip',
  updatedAt: '2026-06-03T10:01:00.000Z',
  workflowStatus: 'COMPLETED',
});

const getFirstInvocationCallOrder = (
  invocationCallOrder: number[],
  label: string,
) => {
  const [callOrder] = invocationCallOrder;
  expect(callOrder, `${label} first call order`).toEqual(expect.any(Number));
  if (callOrder === undefined) {
    throw new Error(`${label} was not called`);
  }
  return callOrder;
};

describe('useApprovalInitializationBridge', () => {
  beforeEach(() => {
    mocks.experimentalRouteRemount.mockReset().mockResolvedValue(undefined);
    mocks.refetchRunning.mockReset().mockResolvedValue(undefined);
  });

  it('does not route-refresh when upload processing completed but approval is still pending', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(
      () =>
        useApprovalInitializationBridge(
          makeParams({ terminalApprovalStatus: 'REQUIRES_APPROVAL' }),
        ),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {});

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(mocks.experimentalRouteRemount).not.toHaveBeenCalled();
  });

  it('keeps the completion refresh for uploads that already committed a project version', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(
      () =>
        useApprovalInitializationBridge(
          makeParams({ terminalApprovalStatus: null }),
        ),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() =>
      expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1'),
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => call[0]?.queryKey,
    );

    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['files', 'project-1'],
        ['processing-files', 'project-1'],
        ['projects'],
      ]),
    );
    expect(mocks.refetchRunning).toHaveBeenCalledTimes(1);
    const refetchRunningCallOrder = getFirstInvocationCallOrder(
      mocks.refetchRunning.mock.invocationCallOrder,
      'refetchRunning',
    );
    const routeRemountCallOrder = getFirstInvocationCallOrder(
      mocks.experimentalRouteRemount.mock.invocationCallOrder,
      'experimentalRouteRemount',
    );
    expect(refetchRunningCallOrder).toBeLessThan(routeRemountCallOrder);
  });

  it('fire-and-forgets running workflow refresh when approval initialization finishes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = renderHook(
      ({ approvalStatus }: { approvalStatus: 'APPROVING' | 'APPROVED' }) =>
        useApprovalInitializationBridge(
          makeParams({
            phase: 'approval-initializing',
            processingFiles: [makeZipFile(approvalStatus)],
            terminalApprovalStatus: approvalStatus,
          }),
        ),
      {
        initialProps: { approvalStatus: 'APPROVING' },
        wrapper: makeWrapper(queryClient),
      },
    );

    rerender({ approvalStatus: 'APPROVED' });

    await waitFor(() =>
      expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1'),
    );

    expect(mocks.refetchRunning).toHaveBeenCalledTimes(1);
    const refetchRunningCallOrder = getFirstInvocationCallOrder(
      mocks.refetchRunning.mock.invocationCallOrder,
      'refetchRunning',
    );
    const routeRemountCallOrder = getFirstInvocationCallOrder(
      mocks.experimentalRouteRemount.mock.invocationCallOrder,
      'experimentalRouteRemount',
    );
    expect(refetchRunningCallOrder).toBeLessThan(routeRemountCallOrder);
  });

  it('still remounts the route when the fire-and-forget running workflow refresh fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.refetchRunning.mockRejectedValue(new Error('refetch failed'));

    renderHook(
      () =>
        useApprovalInitializationBridge(
          makeParams({ terminalApprovalStatus: null }),
        ),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() =>
      expect(mocks.experimentalRouteRemount).toHaveBeenCalledWith('project-1'),
    );

    expect(mocks.refetchRunning).toHaveBeenCalledTimes(1);
  });
});
