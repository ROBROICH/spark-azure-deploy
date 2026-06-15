import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileDownloadUrl } from './useFileDownloadUrl';

const mocks = vi.hoisted(() => ({
  queryResult: {
    data: undefined as { downloadUrl?: string } | undefined,
    isLoading: false,
    isError: false,
  },
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: () => 7,
}));

vi.mock('@/api-clients/dms-module/@tanstack/react-query.gen', () => ({
  generateDownloadUrlV2FilesFileIdGenerateDownloadUrlGetOptions: vi.fn(
    (params) => ({
      queryKey: ['download-url', params],
      queryFn: vi.fn(),
    }),
  ),
}));

beforeEach(() => {
  window.__APP_CONFIG__ = {
    VITE_ALLOWED_DOWNLOAD_ORIGINS: 'https://storage.example.test',
  };
  mocks.queryResult = {
    data: undefined,
    isLoading: false,
    isError: false,
  };
  mocks.useQuery.mockImplementation(() => mocks.queryResult);
});

describe('useFileDownloadUrl', () => {
  it('returns allowed signed HTTPS download URLs', () => {
    mocks.queryResult.data = {
      downloadUrl: 'https://storage.example.test/file.pdf?signature=abc',
    };

    const { result } = renderHook(() => useFileDownloadUrl('file-1'));

    expect(result.current).toEqual({
      downloadUrl: 'https://storage.example.test/file.pdf?signature=abc',
      isLoading: false,
      isError: false,
    });
  });

  it('turns untrusted returned URLs into an error without exposing the raw URL', () => {
    mocks.queryResult.data = {
      downloadUrl: 'https://attacker.example.test/file.pdf?signature=abc',
    };

    const { result } = renderHook(() => useFileDownloadUrl('file-1'));

    expect(result.current).toEqual({
      downloadUrl: undefined,
      isLoading: false,
      isError: true,
    });
  });

  it('preserves upstream query error state', () => {
    mocks.queryResult.isError = true;

    const { result } = renderHook(() => useFileDownloadUrl('file-1'));

    expect(result.current).toEqual({
      downloadUrl: undefined,
      isLoading: false,
      isError: true,
    });
  });
});
