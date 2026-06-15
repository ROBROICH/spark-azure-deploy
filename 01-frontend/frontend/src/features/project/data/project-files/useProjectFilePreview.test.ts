import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectFilePreview } from './useProjectFilePreview';

const mocks = vi.hoisted(() => ({
  useProjectFile: vi.fn(),
  useFileDownloadUrl: vi.fn(),
}));

vi.mock('./useProjectFiles', () => ({
  useProjectFile: mocks.useProjectFile,
}));

vi.mock('./useFileDownloadUrl', () => ({
  useFileDownloadUrl: mocks.useFileDownloadUrl,
}));

beforeEach(() => {
  mocks.useProjectFile.mockReturnValue({
    file: null,
    isLoading: false,
    isError: false,
  });
  mocks.useFileDownloadUrl.mockReturnValue({
    downloadUrl: undefined,
    isLoading: false,
    isError: false,
  });
});

describe('useProjectFilePreview', () => {
  it('does not request a signed URL until the file is confirmed in the active project', () => {
    renderHook(() =>
      useProjectFilePreview({
        projectId: 'project-1',
        fileId: 'arbitrary-file-id',
        fallbackTitle: 'Fallback title',
      }),
    );

    expect(mocks.useProjectFile).toHaveBeenCalledWith({
      documentVersion: undefined,
      projectId: 'project-1',
      fileId: 'arbitrary-file-id',
    });
    expect(mocks.useFileDownloadUrl).toHaveBeenCalledWith(null, {
      projectVersion: undefined,
    });
  });

  it('requests a signed URL only for a resolved project file', () => {
    mocks.useProjectFile.mockReturnValue({
      file: {
        id: 'file-1',
        filename: 'folder/confirmed.pdf',
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useProjectFilePreview({
        documentVersion: 3,
        projectId: 'project-1',
        fileId: 'file-1',
        fallbackTitle: 'Fallback title',
      }),
    );

    expect(mocks.useFileDownloadUrl).toHaveBeenCalledWith('file-1', {
      projectVersion: 3,
    });
    expect(result.current.title).toBe('confirmed.pdf');
    expect(result.current.isFileNotFound).toBe(false);
  });

  it('reports a missing active-project file without requesting a signed URL', () => {
    const { result } = renderHook(() =>
      useProjectFilePreview({
        projectId: 'project-1',
        fileId: 'missing-file',
        fallbackTitle: 'Fallback title',
      }),
    );

    expect(mocks.useFileDownloadUrl).toHaveBeenCalledWith(null, {
      projectVersion: undefined,
    });
    expect(result.current.isFileNotFound).toBe(true);
    expect(result.current.title).toBe('Fallback title');
  });

  it('reports project file catalog errors separately from missing files', () => {
    mocks.useProjectFile.mockReturnValue({
      file: null,
      isLoading: false,
      isError: true,
    });

    const { result } = renderHook(() =>
      useProjectFilePreview({
        projectId: 'project-1',
        fileId: 'file-1',
        fallbackTitle: 'Fallback title',
      }),
    );

    expect(mocks.useFileDownloadUrl).toHaveBeenCalledWith(null, {
      projectVersion: undefined,
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.isFileNotFound).toBe(false);
  });
});
