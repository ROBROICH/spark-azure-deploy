import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useUploadFileSelection } from './useUploadFileSelection';

const file = (name: string) =>
  new File(['payload'], name, { type: 'application/zip' });

beforeAll(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () =>
      `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('useUploadFileSelection', () => {
  it('rejects multiple ZIPs without retaining the first archive', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('a.zip'), file('b.zip')]);
    });

    expect(result.current.files).toEqual([]);
  });

  it('marks an unsupported file without queuing it for upload', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('report.pdf')]);
    });

    const invalid = result.current.files.find(
      (entry) => entry.file.name === 'report.pdf',
    );
    expect(invalid?.status).toBe('error');
    expect(invalid?.errorReason).toBe('unsupported-format');
  });

  it('dedupes by filename so re-adding the same name does not re-queue it', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('docs.zip')]);
    });
    act(() => {
      result.current.addFiles([file('docs.zip')]);
    });

    expect(
      result.current.files.filter((entry) => entry.file.name === 'docs.zip')
        .length,
    ).toBe(1);
  });

  it('preserves the selected ZIP when another archive is added', () => {
    const { result } = renderHook(() => useUploadFileSelection());
    act(() => {
      result.current.addFiles([file('a.zip')]);
    });
    let error: ReturnType<typeof result.current.addFiles> = null;
    act(() => {
      error = result.current.addFiles([file('b.zip')]);
    });
    expect(error).toBe('single-zip-required');
    expect(result.current.files.map((entry) => entry.file.name)).toEqual([
      'a.zip',
    ]);
  });

  it('removes the selected ZIP', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('a.zip')]);
    });
    const targetId = result.current.files.at(0)?.id;
    expect(targetId).toBeDefined();

    act(() => {
      result.current.removeFile(targetId as string);
    });

    expect(result.current.files).toEqual([]);
  });

  it('marks the selected ZIP as upload-failed', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('a.zip')]);
    });
    const target = result.current.files.at(0);
    expect(target).toBeDefined();

    act(() => {
      result.current.markFileAsUploadFailed(target?.id ?? '');
    });

    expect(result.current.files.at(0)?.status).toBe('error');
    expect(result.current.files.at(0)?.errorReason).toBe('upload-failed');
  });

  it('accepts uppercase .ZIP filenames as queued (extension check is case-insensitive)', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('docs.ZIP')]);
    });

    const queued = result.current.files.find(
      (entry) => entry.file.name === 'docs.ZIP',
    );
    expect(queued?.status).toBe('queued');
    expect(queued?.errorReason).toBeUndefined();
  });
});
