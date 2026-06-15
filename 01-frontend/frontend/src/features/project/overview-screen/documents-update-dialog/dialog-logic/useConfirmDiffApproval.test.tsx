import type { FileDiffResponse } from '@/api-clients/dms-module';
import { resetProjectPermissionTestMocks } from '@/features/project/test/projectPermissionTestMocks';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getApprovalFeedbackTestMocks,
  makeApprovalTestQueryWrapper,
  resetApprovalFeedbackTestMocks,
} from './approvalHookTestUtils';
import type { ApprovalActions } from './useApprovalActions';
import { useConfirmDiffApproval } from './useConfirmDiffApproval';

const mocks = vi.hoisted(() => ({
  setFileDiffMutate: vi.fn(),
  submitDecisionMutate: vi.fn(),
  routerInvalidate: vi.fn(),
}));

vi.mock('@/integrations/router/router', () => ({
  router: { invalidate: mocks.routerInvalidate },
}));

const makeApprovalActions = () =>
  ({
    setFileDiff: { mutateAsync: mocks.setFileDiffMutate, isPending: false },
    submitDecision: {
      mutateAsync: mocks.submitDecisionMutate,
      isPending: false,
    },
    cancelUpload: { mutateAsync: vi.fn(), isPending: false },
  }) satisfies ApprovalActions;

const baseDiff: FileDiffResponse = {
  new: [],
  deleted: [],
  changed: [],
  renamed: [],
  unchanged: [],
};

const baseParams = {
  zipFileId: 'zip-1',
  projectId: 'proj-1',
  diff: baseDiff,
  selectedKeys: new Set<string>(),
};

describe('useConfirmDiffApproval', () => {
  beforeEach(() => {
    resetProjectPermissionTestMocks();
    mocks.setFileDiffMutate.mockReset();
    mocks.submitDecisionMutate.mockReset();
    mocks.routerInvalidate.mockReset().mockResolvedValue(undefined);
    resetApprovalFeedbackTestMocks();
  });

  it('skips work when zipFileId or diff is missing', async () => {
    const onApproved = vi.fn();
    const { result } = renderHook(
      () => useConfirmDiffApproval(makeApprovalActions()),
      { wrapper: makeApprovalTestQueryWrapper() },
    );

    await act(async () => {
      await result.current.confirm({
        ...baseParams,
        zipFileId: null,
        onApproved,
      });
    });

    expect(mocks.setFileDiffMutate).not.toHaveBeenCalled();
    expect(mocks.submitDecisionMutate).not.toHaveBeenCalled();
    expect(mocks.routerInvalidate).not.toHaveBeenCalled();
    expect(onApproved).not.toHaveBeenCalled();
  });

  it('fails closed without a projectId and reports to Sentry', async () => {
    const onApproved = vi.fn();
    const { result } = renderHook(
      () => useConfirmDiffApproval(makeApprovalActions()),
      { wrapper: makeApprovalTestQueryWrapper() },
    );

    await act(async () => {
      await result.current.confirm({
        ...baseParams,
        projectId: null,
        onApproved,
      });
    });

    expect(mocks.setFileDiffMutate).not.toHaveBeenCalled();
    expect(mocks.submitDecisionMutate).not.toHaveBeenCalled();
    expect(mocks.routerInvalidate).not.toHaveBeenCalled();
    expect(onApproved).not.toHaveBeenCalled();
    expect(
      getApprovalFeedbackTestMocks().captureException,
    ).toHaveBeenCalledTimes(1);
    // Distinguish this fail-closed path from the no-mutate-rights path by
    // asserting on the captured error message (the no-projectId branch is the
    // only one without `flow: 'permission-denied'` tags).
    const capturedError =
      getApprovalFeedbackTestMocks().captureException.mock.calls[0]?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toContain('without a projectId');
  });

  it('runs setFileDiff then submitDecision then onApproved on success', async () => {
    mocks.setFileDiffMutate.mockResolvedValue(undefined);
    mocks.submitDecisionMutate.mockResolvedValue(undefined);

    const onApproved = vi.fn();
    const { result } = renderHook(
      () => useConfirmDiffApproval(makeApprovalActions()),
      { wrapper: makeApprovalTestQueryWrapper() },
    );

    await act(async () => {
      await result.current.confirm({ ...baseParams, onApproved });
    });

    expect(mocks.setFileDiffMutate).toHaveBeenCalledWith({
      path: { file_id: 'zip-1' },
      body: expect.any(Object),
    });
    expect(mocks.submitDecisionMutate).toHaveBeenCalledWith({
      path: { file_id: 'zip-1' },
      query: { decision: 'approve' },
    });
    expect(mocks.routerInvalidate).toHaveBeenCalledWith({
      filter: expect.any(Function),
      sync: true,
    });
    const invalidateFilter = mocks.routerInvalidate.mock.calls[0]?.[0].filter;
    expect(
      invalidateFilter({ params: { verfahrenId: 'proj-1' } }),
    ).toBeTruthy();
    expect(
      invalidateFilter({ params: { verfahrenId: 'other-project' } }),
    ).toBeFalsy();
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(
      mocks.submitDecisionMutate.mock.invocationCallOrder.at(0),
    ).toBeLessThan(mocks.routerInvalidate.mock.invocationCallOrder.at(0) ?? 0);
    expect(mocks.routerInvalidate.mock.invocationCallOrder.at(0)).toBeLessThan(
      onApproved.mock.invocationCallOrder.at(0) ?? 0,
    );
    expect(result.current.approveError).toBeNull();
  });

  it('flags set-diff failure, surfaces a toast, and skips submitDecision', async () => {
    mocks.setFileDiffMutate.mockRejectedValue(new Error('set-diff failed'));

    const onApproved = vi.fn();
    const { result } = renderHook(
      () => useConfirmDiffApproval(makeApprovalActions()),
      { wrapper: makeApprovalTestQueryWrapper() },
    );

    await act(async () => {
      await result.current.confirm({ ...baseParams, onApproved });
    });

    expect(mocks.submitDecisionMutate).not.toHaveBeenCalled();
    expect(mocks.routerInvalidate).not.toHaveBeenCalled();
    expect(onApproved).not.toHaveBeenCalled();
    expect(getApprovalFeedbackTestMocks().toastError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.approveError).toBe('set-diff'));
  });

  it('flags submit-decision failure after a successful set-diff', async () => {
    mocks.setFileDiffMutate.mockResolvedValue(undefined);
    mocks.submitDecisionMutate.mockRejectedValue(new Error('submit failed'));

    const onApproved = vi.fn();
    const { result } = renderHook(
      () => useConfirmDiffApproval(makeApprovalActions()),
      { wrapper: makeApprovalTestQueryWrapper() },
    );

    await act(async () => {
      await result.current.confirm({ ...baseParams, onApproved });
    });

    expect(mocks.routerInvalidate).not.toHaveBeenCalled();
    expect(onApproved).not.toHaveBeenCalled();
    expect(getApprovalFeedbackTestMocks().toastError).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(result.current.approveError).toBe('submit-decision'),
    );
  });

  it('clears the previous approveError when retrying successfully', async () => {
    mocks.setFileDiffMutate
      .mockRejectedValueOnce(new Error('first try'))
      .mockResolvedValue(undefined);
    mocks.submitDecisionMutate.mockResolvedValue(undefined);

    const onApproved = vi.fn();
    const { result } = renderHook(
      () => useConfirmDiffApproval(makeApprovalActions()),
      { wrapper: makeApprovalTestQueryWrapper() },
    );

    await act(async () => {
      await result.current.confirm({ ...baseParams, onApproved });
    });
    await waitFor(() => expect(result.current.approveError).toBe('set-diff'));

    await act(async () => {
      await result.current.confirm({ ...baseParams, onApproved });
    });

    await waitFor(() => expect(result.current.approveError).toBeNull());
    expect(mocks.routerInvalidate).toHaveBeenCalledTimes(1);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });
});
