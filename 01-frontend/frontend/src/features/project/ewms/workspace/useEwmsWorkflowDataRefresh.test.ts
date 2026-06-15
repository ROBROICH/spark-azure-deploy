import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEwmsWorkflowDataRefresh } from './useEwmsWorkflowDataRefresh';

const mocks = vi.hoisted(() => ({
  refetchProjectNodeTreeAndPayloads: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/db/nodes/collections/reloadProjectNodeTreeAndPayloads', () => ({
  refetchProjectNodeTreeAndPayloads: mocks.refetchProjectNodeTreeAndPayloads,
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: () => 3,
}));

describe('useEwmsWorkflowDataRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.refetchProjectNodeTreeAndPayloads.mockClear();
    mocks.refetchProjectNodeTreeAndPayloads.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes EWMS node data while the EWMS workflow is running', async () => {
    renderHook(() =>
      useEwmsWorkflowDataRefresh({
        isEwmsWorkflowRunning: true,
        projectId: 'project-1',
        shouldRefreshProcessingData: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchProjectNodeTreeAndPayloads).toHaveBeenCalledWith(
      'project-1',
      3,
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(mocks.refetchProjectNodeTreeAndPayloads).toHaveBeenCalledTimes(2);
  });

  it('refreshes EWMS node data once more when the workflow stops running', async () => {
    let isRunning = true;
    const { rerender } = renderHook(() =>
      useEwmsWorkflowDataRefresh({
        isEwmsWorkflowRunning: isRunning,
        projectId: 'project-1',
        shouldRefreshProcessingData: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchProjectNodeTreeAndPayloads).toHaveBeenCalledTimes(1);

    isRunning = false;
    rerender();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchProjectNodeTreeAndPayloads).toHaveBeenCalledTimes(2);
  });

  it('does not poll EWMS payload data when the workflow is not running', () => {
    renderHook(() =>
      useEwmsWorkflowDataRefresh({
        isEwmsWorkflowRunning: false,
        projectId: 'project-1',
        shouldRefreshProcessingData: true,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(mocks.refetchProjectNodeTreeAndPayloads).not.toHaveBeenCalled();
  });

  it('does not refresh while processing data refreshes are disabled', () => {
    renderHook(() =>
      useEwmsWorkflowDataRefresh({
        isEwmsWorkflowRunning: true,
        projectId: 'project-1',
        shouldRefreshProcessingData: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(mocks.refetchProjectNodeTreeAndPayloads).not.toHaveBeenCalled();
  });
});
