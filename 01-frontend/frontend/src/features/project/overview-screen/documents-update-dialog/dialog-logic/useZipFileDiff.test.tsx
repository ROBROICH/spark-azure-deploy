import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useZipFileDiff } from './useZipFileDiff';

const mocks = vi.hoisted(() => ({
  getDiff: vi.fn(),
}));

vi.mock('@/api-clients/dms-module', () => ({
  getFileDiffV2FilesFileIdDiffGet: mocks.getDiff,
}));

let queryClient: QueryClient;

const wrapper = (props: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: queryClient },
    props.children,
  );

describe('useZipFileDiff', () => {
  beforeEach(() => {
    mocks.getDiff.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('does not fetch when zipFileId is null so the diff query never fires for an empty workflow', () => {
    renderHook(() => useZipFileDiff(null), { wrapper });
    expect(mocks.getDiff).not.toHaveBeenCalled();
  });

  it('fetches and exposes the diff data once a zipFileId is supplied', async () => {
    const diff = {
      new: [],
      deleted: [],
      changed: [],
      renamed: [],
      unchanged: [],
    };
    mocks.getDiff.mockResolvedValue({ data: diff });

    const { result } = renderHook(() => useZipFileDiff('zip-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.getDiff).toHaveBeenCalledWith({ path: { file_id: 'zip-1' } });
    expect(result.current.diff).toEqual(diff);
    expect(result.current.isError).toBe(false);
  });

  it('resolves to null when the backend returns no diff payload', async () => {
    mocks.getDiff.mockResolvedValue({ data: undefined });

    const { result } = renderHook(() => useZipFileDiff('zip-2'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.diff).toBeNull();
  });
});
