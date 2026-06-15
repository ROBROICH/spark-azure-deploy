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
  it('marks valid zip files as queued and invalid files as unsupported-format', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('docs.zip'), file('report.pdf')]);
    });

    const queued = result.current.files.find(
      (entry) => entry.file.name === 'docs.zip',
    );
    const invalid = result.current.files.find(
      (entry) => entry.file.name === 'report.pdf',
    );
    expect(queued?.status).toBe('queued');
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

  it('removes a file by id and leaves the rest of the selection intact', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('a.zip'), file('b.zip')]);
    });
    const targetId = result.current.files.at(0)?.id;
    expect(targetId).toBeDefined();

    act(() => {
      result.current.removeFile(targetId as string);
    });

    expect(result.current.files.map((entry) => entry.file.name)).toEqual([
      'b.zip',
    ]);
  });

  it('marks an entry as upload-failed without affecting siblings', () => {
    const { result } = renderHook(() => useUploadFileSelection());

    act(() => {
      result.current.addFiles([file('a.zip'), file('b.zip')]);
    });
    const target = result.current.files.at(0);
    expect(target).toBeDefined();

    act(() => {
      result.current.markFileAsUploadFailed(target?.id ?? '');
    });

    expect(result.current.files.at(0)?.status).toBe('error');
    expect(result.current.files.at(0)?.errorReason).toBe('upload-failed');
    expect(result.current.files.at(1)?.status).toBe('queued');
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
