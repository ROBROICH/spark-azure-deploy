import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectVersionFreshnessCheck } from './ProjectVersionFreshnessCheck';

const mocks = vi.hoisted(() => ({
  emitProjectVersionConflict: vi.fn(),
  refetchProject: vi.fn(),
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  projectsCollection: {
    utils: {
      refetchProject: mocks.refetchProject,
    },
  },
}));

vi.mock(
  '@/features/project/versioning/conflict-dialogs/projectVersionConflict',
  () => ({
    emitProjectVersionConflict: mocks.emitProjectVersionConflict,
  }),
);

const renderFreshnessCheck = (loaderProjectVersion = 2) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ProjectVersionFreshnessCheck
        loaderProjectVersion={loaderProjectVersion}
        projectId="project-1"
      />
    </QueryClientProvider>,
  );

  return queryClient;
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  mocks.emitProjectVersionConflict.mockReset();
  mocks.refetchProject.mockReset();
});

describe('ProjectVersionFreshnessCheck', () => {
  it('does not refetch immediately after mounting with the loader version', () => {
    renderFreshnessCheck();

    expect(mocks.refetchProject).not.toHaveBeenCalled();
    expect(mocks.emitProjectVersionConflict).not.toHaveBeenCalled();
  });

  it('checks again after five minutes and emits not-latest once for a changed version', async () => {
    vi.useFakeTimers();
    mocks.refetchProject.mockResolvedValue({ latestVersion: 3 });

    renderFreshnessCheck();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    await vi.waitFor(() => {
      expect(mocks.emitProjectVersionConflict).toHaveBeenCalledWith({
        kind: 'not_latest',
        projectId: 'project-1',
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    await vi.waitFor(() => {
      expect(mocks.refetchProject).toHaveBeenCalledTimes(2);
      expect(mocks.emitProjectVersionConflict).toHaveBeenCalledTimes(1);
    });
  });

  it('checks on tab refocus', async () => {
    mocks.refetchProject.mockResolvedValue({ latestVersion: 2 });
    renderFreshnessCheck();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await vi.waitFor(() => {
      expect(mocks.refetchProject).toHaveBeenCalledTimes(1);
    });

    expect(mocks.emitProjectVersionConflict).not.toHaveBeenCalled();
  });

  it('does not emit when the freshness fetch fails', async () => {
    mocks.refetchProject.mockRejectedValue(new Error('network'));

    renderFreshnessCheck();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(mocks.refetchProject).toHaveBeenCalledTimes(1);
    });

    expect(mocks.emitProjectVersionConflict).not.toHaveBeenCalled();
  });
});
