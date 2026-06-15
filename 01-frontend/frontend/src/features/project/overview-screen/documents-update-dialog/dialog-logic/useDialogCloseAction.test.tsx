import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalActions } from './useApprovalActions';
import { useDialogCloseAction } from './useDialogCloseAction';

const mocks = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  submitMutate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: mocks.toastError },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const makeApprovalActions = () =>
  ({
    setFileDiff: { mutateAsync: vi.fn(), isPending: false },
    submitDecision: { mutateAsync: mocks.submitMutate, isPending: false },
    cancelUpload: { mutateAsync: mocks.cancelMutate, isPending: false },
  }) satisfies ApprovalActions;

const wrapper = (props: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, props.children);
};

describe('useDialogCloseAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does nothing when the upload has no zip file id yet', async () => {
    const { result } = renderHook(
      () => useDialogCloseAction(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.runCloseSideEffect({
        phase: 'selecting',
        zipFileId: null,
        projectId: 'project-test',
      });
    });

    expect(mocks.cancelMutate).not.toHaveBeenCalled();
    expect(mocks.submitMutate).not.toHaveBeenCalled();
  });

  it('cancels the in-flight upload while uploading', async () => {
    mocks.cancelMutate.mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useDialogCloseAction(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.runCloseSideEffect({
        phase: 'uploading',
        zipFileId: 'zip-1',
        projectId: 'project-test',
      });
    });

    expect(mocks.cancelMutate).toHaveBeenCalledWith('zip-1');
    expect(mocks.submitMutate).not.toHaveBeenCalled();
  });

  it('does not submit a decision when closing during diff review (reject is explicit-only)', async () => {
    const { result } = renderHook(
      () => useDialogCloseAction(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.runCloseSideEffect({
        phase: 'diff',
        zipFileId: 'zip-2',
        projectId: 'project-test',
      });
    });

    expect(mocks.submitMutate).not.toHaveBeenCalled();
    expect(mocks.cancelMutate).not.toHaveBeenCalled();
  });

  it('surfaces a toast when the cancel call fails so orphan workflows are visible', async () => {
    mocks.cancelMutate.mockRejectedValue(new Error('cancel failed'));

    const { result } = renderHook(
      () => useDialogCloseAction(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.runCloseSideEffect({
        phase: 'uploading',
        zipFileId: 'zip-3',
        projectId: 'project-test',
      });
    });

    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('Documents.updateDocuments.closeError'),
    );
  });

  it('re-invalidates project caches when closing from a post-workflow phase so the documents table and version badge refetch without a manual page refresh', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const localWrapper = (props: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, props.children);

    const { result } = renderHook(
      () => useDialogCloseAction(makeApprovalActions()),
      { wrapper: localWrapper },
    );

    await act(async () => {
      await result.current.runCloseSideEffect({
        phase: 'upload-success',
        zipFileId: 'zip-5',
        projectId: 'project-test',
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => call[0]?.queryKey,
    );

    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['files', 'project-test'],
        ['processing-files', 'project-test'],
        ['projects'],
      ]),
    );
  });

  it('does not call any mutation for terminal phases (upload-success / ai-processes)', async () => {
    const { result } = renderHook(
      () => useDialogCloseAction(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.runCloseSideEffect({
        phase: 'upload-success',
        zipFileId: 'zip-4',
        projectId: 'project-test',
      });
      await result.current.runCloseSideEffect({
        phase: 'ai-processes',
        zipFileId: 'zip-4',
        projectId: 'project-test',
      });
    });

    expect(mocks.cancelMutate).not.toHaveBeenCalled();
    expect(mocks.submitMutate).not.toHaveBeenCalled();
  });
});
