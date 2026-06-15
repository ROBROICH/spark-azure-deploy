import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useApprovalActions } from './useApprovalActions';

const mocks = vi.hoisted(() => ({
  cancelUpload: vi.fn(),
  setFileDiffMutationFn: vi.fn(),
  submitDecisionMutationFn: vi.fn(),
}));

vi.mock('@/api-clients/dms-module', () => ({
  cancelUploadProcessV2FilesFileIdCancelGet: mocks.cancelUpload,
}));

vi.mock('@/api-clients/dms-module/@tanstack/react-query.gen', () => ({
  setFileDiffV2FilesFileIdDiffPostMutation: () => ({
    mutationFn: mocks.setFileDiffMutationFn,
  }),
  submitApprovalV2FilesFileIdDecisionPostMutation: () => ({
    mutationFn: mocks.submitDecisionMutationFn,
  }),
}));

let queryClient: QueryClient;

const wrapper = (props: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    props.children,
  );

describe('useApprovalActions', () => {
  beforeEach(() => {
    mocks.cancelUpload.mockReset();
    mocks.setFileDiffMutationFn.mockReset();
    mocks.submitDecisionMutationFn.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('routes cancelUpload through the generated client with the file id path param', async () => {
    mocks.cancelUpload.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() => useApprovalActions(), { wrapper });
    await act(async () => {
      await result.current.cancelUpload.mutateAsync('zip-9');
    });

    expect(mocks.cancelUpload).toHaveBeenCalledWith({
      path: { file_id: 'zip-9' },
    });
  });
});
