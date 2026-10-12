import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import type { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createApprovalTestQueryClient,
  getApprovalFeedbackTestMocks,
  makeApprovalTestQueryWrapper,
  resetApprovalFeedbackTestMocks,
} from './approvalHookTestUtils';
import type { ApprovalActions } from './useApprovalActions';
import { useRejectDiffApproval } from './useRejectDiffApproval';

const mocks = vi.hoisted(() => ({
  submitDecisionMutate: vi.fn(),
}));

const makeApprovalActions = () =>
  ({
    setFileDiff: { mutateAsync: vi.fn(), isPending: false },
    submitDecision: {
      mutateAsync: mocks.submitDecisionMutate,
      isPending: false,
    },
    cancelUpload: { mutateAsync: vi.fn(), isPending: false },
  }) satisfies ApprovalActions;

let queryClient: QueryClient;
let wrapper: ReturnType<typeof makeApprovalTestQueryWrapper>;

const baseParams = {
  zipFileId: 'zip-1',
  projectId: 'project-1',
};

describe('useRejectDiffApproval', () => {
  beforeEach(() => {
    mocks.submitDecisionMutate.mockReset();
    resetApprovalFeedbackTestMocks();
    resetProjectPermissionTestMocks();
    queryClient = createApprovalTestQueryClient();
    wrapper = makeApprovalTestQueryWrapper(queryClient);
  });

  it('skips work when zipFileId or projectId is missing', async () => {
    const onRejected = vi.fn();
    const { result } = renderHook(
      () => useRejectDiffApproval(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.reject({
        ...baseParams,
        zipFileId: null,
        onRejected,
      });
    });

    expect(mocks.submitDecisionMutate).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('fails closed, surfaces a toast, and reports to Sentry when the caller lacks mutate rights', async () => {
    setProjectCanMutate(false);
    const onRejected = vi.fn();

    const { result } = renderHook(
      () => useRejectDiffApproval(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.reject({ ...baseParams, onRejected });
    });

    expect(mocks.submitDecisionMutate).not.toHaveBeenCalled();
    expect(
      getApprovalFeedbackTestMocks().captureException,
    ).toHaveBeenCalledTimes(1);
    expect(getApprovalFeedbackTestMocks().toastError).toHaveBeenCalledTimes(1);
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('submits the reject decision, invalidates project caches, then calls onRejected', async () => {
    mocks.submitDecisionMutate.mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const onRejected = vi.fn();

    const { result } = renderHook(
      () => useRejectDiffApproval(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.reject({ ...baseParams, onRejected });
    });

    expect(mocks.submitDecisionMutate).toHaveBeenCalledWith({
      path: { fileId: 'zip-1' },
      query: { decision: 'reject' },
    });
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
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(result.current.rejectError).toBe(false);
  });

  it('flags rejectError and surfaces a toast when the mutation fails, and skips onRejected', async () => {
    mocks.submitDecisionMutate.mockRejectedValue(new Error('reject failed'));
    const onRejected = vi.fn();

    const { result } = renderHook(
      () => useRejectDiffApproval(makeApprovalActions()),
      { wrapper },
    );
    await act(async () => {
      await result.current.reject({ ...baseParams, onRejected });
    });

    await waitFor(() => expect(result.current.rejectError).toBe(true));
    expect(getApprovalFeedbackTestMocks().toastError).toHaveBeenCalledTimes(1);
    expect(
      getApprovalFeedbackTestMocks().captureException,
    ).toHaveBeenCalledTimes(1);
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('clears rejectError on a subsequent successful retry', async () => {
    mocks.submitDecisionMutate
      .mockRejectedValueOnce(new Error('first try'))
      .mockResolvedValue(undefined);
    const onRejected = vi.fn();

    const { result } = renderHook(
      () => useRejectDiffApproval(makeApprovalActions()),
      { wrapper },
    );

    await act(async () => {
      await result.current.reject({ ...baseParams, onRejected });
    });
    await waitFor(() => expect(result.current.rejectError).toBe(true));

    await act(async () => {
      await result.current.reject({ ...baseParams, onRejected });
    });

    await waitFor(() => expect(result.current.rejectError).toBe(false));
    expect(onRejected).toHaveBeenCalledTimes(1);
  });
});
