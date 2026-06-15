import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ProjectVersioning from '@/features/project/versioning/projectVersioning';

import { useUploadCompletionPolling } from './useUploadCompletionPolling';

const mocks = vi.hoisted(() => ({
  listZipFilesV2ZipFilesGet: vi.fn(),
  useProjectRouteVersion: vi.fn(() => 4),
}));

vi.mock('@/api-clients/dms-module', () => ({
  listZipFilesV2ZipFilesGet: mocks.listZipFilesV2ZipFilesGet,
}));

vi.mock(
  '@/features/project/versioning/projectVersioning',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ProjectVersioning>()),
    useProjectRouteVersion: mocks.useProjectRouteVersion,
  }),
);

const queryClients: QueryClient[] = [];

const makeWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClients.push(queryClient);
  return (props: { children: React.ReactNode }) => {
    const { children } = props;
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
};

describe('useUploadCompletionPolling', () => {
  beforeEach(() => {
    mocks.listZipFilesV2ZipFilesGet.mockReset();
    mocks.useProjectRouteVersion.mockClear();
  });

  afterEach(async () => {
    await waitFor(() =>
      expect(
        queryClients.every((queryClient) => queryClient.isFetching() === 0),
      ).toBe(true),
    );
    cleanup();
    queryClients.forEach((queryClient) => {
      queryClient.clear();
    });
    queryClients.length = 0;
  });

  it('reports incomplete while the workflow is still active', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [{ id: 'zip-1', type: 'zip', workflowStatus: 'RUNNING' }],
    });

    const { result } = renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.terminalStatus).toBe('RUNNING'));
    expect(mocks.listZipFilesV2ZipFilesGet).toHaveBeenCalledWith({
      query: {
        projectId: 'proj-1',
        project_version: 4,
        page: 1,
        page_size: 50,
      },
      throwOnError: true,
    });
    expect(result.current.isProcessingComplete).toBe(false);
  });

  it('reports complete when the workflow has left the active set', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [{ id: 'zip-1', type: 'zip', workflowStatus: 'COMPLETED' }],
    });

    const { result } = renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isProcessingComplete).toBe(true));
  });

  it('exposes APPROVING approval status for the version initialization step', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [
        {
          id: 'zip-1',
          type: 'zip',
          workflowStatus: 'COMPLETED',
          approvalStatus: 'APPROVING',
        },
      ],
    });

    const { result } = renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() =>
      expect(result.current.terminalApprovalStatus).toBe('APPROVING'),
    );
    expect(result.current.isProcessingComplete).toBe(true);
  });

  it('stays incomplete when the polled zip is missing from the response', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [{ id: 'other', workflowStatus: 'COMPLETED' }],
    });

    const { result } = renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() =>
      expect(mocks.listZipFilesV2ZipFilesGet).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(
        queryClients.every((queryClient) => queryClient.isFetching() === 0),
      ).toBe(true),
    );
    expect(result.current.isProcessingComplete).toBe(false);
  });

  it('does not call the API when disabled', () => {
    mocks.listZipFilesV2ZipFilesGet.mockReset();

    renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: false,
        }),
      { wrapper: makeWrapper() },
    );

    expect(mocks.listZipFilesV2ZipFilesGet).not.toHaveBeenCalled();
  });

  it('reports failure when the polled query errors', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockRejectedValue(new Error('network'));

    const { result } = renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isProcessingFailed).toBe(true));
    expect(result.current.isProcessingComplete).toBe(false);
  });

  it('reports failure when the polled zip transitions to a failed status', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [{ id: 'zip-1', type: 'zip', workflowStatus: 'FAILED' }],
    });

    const { result } = renderHook(
      () =>
        useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isProcessingFailed).toBe(true));
    expect(result.current.isProcessingComplete).toBe(false);
    expect(result.current.terminalStatus).toBe('FAILED');
  });

  it('reports failure after the soft timeout when the target zip never appears', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [{ id: 'other', workflowStatus: 'COMPLETED' }],
    });

    const { result } = renderHook(
      () => {
        return useUploadCompletionPolling({
          zipFileId: 'zip-1',
          projectId: 'proj-1',
          enabled: true,
          maxMissingPolls: 1,
        });
      },
      { wrapper: makeWrapper() },
    );

    // First poll: target missing, counter becomes 1, hits the soft timeout.
    await waitFor(() => expect(result.current.isProcessingFailed).toBe(true));
    expect(result.current.isProcessingComplete).toBe(false);
  });

  it('starts the missing-poll timeout from zero when the polling session changes', async () => {
    mocks.listZipFilesV2ZipFilesGet.mockResolvedValue({
      data: [{ id: 'other', workflowStatus: 'COMPLETED' }],
    });

    const { result, rerender } = renderHook(
      ({ zipFileId }: { zipFileId: string }) =>
        useUploadCompletionPolling({
          zipFileId,
          projectId: 'proj-1',
          enabled: true,
          maxMissingPolls: 2,
        }),
      {
        initialProps: { zipFileId: 'zip-1' },
        wrapper: makeWrapper(),
      },
    );

    const pollingQueryClient = queryClients[0];
    if (pollingQueryClient === undefined) {
      throw new Error('Expected test query client');
    }

    await waitFor(() =>
      expect(mocks.listZipFilesV2ZipFilesGet).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      await pollingQueryClient.invalidateQueries({
        queryKey: ['processing-files', 'proj-1'],
      });
    });

    await waitFor(() =>
      expect(mocks.listZipFilesV2ZipFilesGet).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      await pollingQueryClient.invalidateQueries({
        queryKey: ['processing-files', 'proj-1'],
      });
    });

    await waitFor(() =>
      expect(mocks.listZipFilesV2ZipFilesGet).toHaveBeenCalledTimes(3),
    );
    await waitFor(() => expect(result.current.isProcessingFailed).toBe(true));

    rerender({ zipFileId: 'zip-2' });
    expect(result.current.isProcessingFailed).toBe(false);

    await act(async () => {
      await pollingQueryClient.invalidateQueries({
        queryKey: ['processing-files', 'proj-1'],
      });
    });

    await waitFor(() =>
      expect(mocks.listZipFilesV2ZipFilesGet).toHaveBeenCalledTimes(4),
    );
    expect(result.current.isProcessingFailed).toBe(false);
  });
});
