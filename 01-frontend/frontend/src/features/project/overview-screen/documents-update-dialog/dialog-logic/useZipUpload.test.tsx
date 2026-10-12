import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useZipUpload } from './useZipUpload';

const mocks = vi.hoisted(() => ({
  generateUrl: vi.fn(),
  confirmUpload: vi.fn(),
  startProcessing: vi.fn(),
}));

vi.mock('@/api-clients/backend/sdk.gen', () => ({
  v1DocumentManagementGenerateFileUploadUrl: mocks.generateUrl,
  v1DocumentManagementConfirmFileUpload: mocks.confirmUpload,
  v1DocumentManagementStartFileProcessing: mocks.startProcessing,
}));

let queryClient: QueryClient;

const wrapper = (props: { children: React.ReactNode }) => {
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    props.children,
  );
};

const file = new File(['x'], 'docs.zip', { type: 'application/zip' });
const originalAppConfig = window.__APP_CONFIG__;

describe('useZipUpload', () => {
  beforeEach(() => {
    window.__APP_CONFIG__ = {
      VITE_ALLOWED_UPLOAD_ORIGINS: 'https://storage',
    };
    mocks.generateUrl.mockReset();
    mocks.confirmUpload.mockReset();
    mocks.startProcessing.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    window.__APP_CONFIG__ = originalAppConfig;
    vi.unstubAllGlobals();
  });

  it('returns success with the confirmed zip file id on the happy path', async () => {
    mocks.generateUrl.mockResolvedValue({
      data: { uploadUrl: 'https://storage/test', mimeType: 'application/zip' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    mocks.confirmUpload.mockResolvedValue({ data: { id: 'zip-1' } });
    mocks.startProcessing.mockResolvedValue({ data: undefined });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useZipUpload(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.uploadZip>> | null =
      null;
    await act(async () => {
      outcome = await result.current.uploadZip(file, 'project-1');
    });

    expect(outcome).toEqual({ kind: 'success', zipFileId: 'zip-1' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['files', 'project-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['processing-files', 'project-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['projects'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [{ _id: 'listTemporalWorkflows' }],
    });
  });

  it('reports `storage-put` when the S3 PUT fails so retries cannot resolve as success', async () => {
    mocks.generateUrl.mockResolvedValue({
      data: { uploadUrl: 'https://storage/test', mimeType: 'application/zip' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502 }),
    );

    const { result } = renderHook(() => useZipUpload(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.uploadZip>> | null =
      null;
    await act(async () => {
      outcome = await result.current.uploadZip(file, 'project-1');
    });

    expect(outcome).toMatchObject({ kind: 'error', stage: 'storage-put' });
    expect(outcome).toMatchObject({ httpStatus: 502 });
    expect(mocks.confirmUpload).not.toHaveBeenCalled();
  });

  it('reports `storage-put` and skips fetch when the generated upload URL is unsafe', async () => {
    mocks.generateUrl.mockResolvedValue({
      data: {
        uploadUrl: 'https://attacker.example/test',
        mimeType: 'application/zip',
      },
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useZipUpload(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.uploadZip>> | null =
      null;
    await act(async () => {
      outcome = await result.current.uploadZip(file, 'project-1');
    });

    expect(outcome).toMatchObject({ kind: 'error', stage: 'storage-put' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.confirmUpload).not.toHaveBeenCalled();
  });

  it('reports `generate-url` when the URL generation rejects', async () => {
    mocks.generateUrl.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useZipUpload(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.uploadZip>> | null =
      null;
    await act(async () => {
      outcome = await result.current.uploadZip(file, 'project-1');
    });

    expect(outcome).toMatchObject({ kind: 'error', stage: 'generate-url' });
  });

  it('reports `confirm` when the confirm-upload step fails after a successful PUT', async () => {
    mocks.generateUrl.mockResolvedValue({
      data: { uploadUrl: 'https://storage/test', mimeType: 'application/zip' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    mocks.confirmUpload.mockRejectedValue(new Error('confirm'));

    const { result } = renderHook(() => useZipUpload(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.uploadZip>> | null =
      null;
    await act(async () => {
      outcome = await result.current.uploadZip(file, 'project-1');
    });

    expect(outcome).toMatchObject({ kind: 'error', stage: 'confirm' });
  });
});
