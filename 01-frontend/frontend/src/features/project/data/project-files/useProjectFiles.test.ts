import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ProjectVersioning from '@/features/project/versioning/projectVersioning';
import { useProjectFile, useProjectFiles } from './useProjectFiles';

const mocks = vi.hoisted(() => ({
  loadProjectFiles: vi.fn(),
  useQuery: vi.fn(),
  useProjectRouteVersion: vi.fn(() => 7),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock(
  '@/features/project/versioning/projectVersioning',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ProjectVersioning>()),
    useProjectRouteVersion: mocks.useProjectRouteVersion,
  }),
);

vi.mock('../collections/files.collection', () => ({
  loadProjectFiles: mocks.loadProjectFiles,
}));

type UseQueryOptions = {
  queryKey: ReadonlyArray<unknown>;
  queryFn: () => Promise<unknown>;
  enabled: boolean;
};

describe('useProjectFiles', () => {
  beforeEach(() => {
    mocks.loadProjectFiles.mockReset();
    mocks.useQuery.mockReset();
    mocks.useProjectRouteVersion.mockClear();
    mocks.useQuery.mockReturnValue({
      data: [],
      isError: false,
      isLoading: false,
    });
  });

  it('disables the query without loading files', () => {
    const { result } = renderHook(() =>
      useProjectFiles('project-1', { enabled: false }),
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ['files', 'project-1', undefined],
      }),
    );
    expect(result.current).toEqual({
      files: [],
      isError: false,
      isLoading: false,
    });
  });

  it('loads documents for the active project version by default', async () => {
    renderHook(() => useProjectFiles('project-1'));

    const options = mocks.useQuery.mock.calls[0]?.[0] as UseQueryOptions;
    await options.queryFn();

    expect(mocks.useProjectRouteVersion).toHaveBeenCalled();
    expect(options).toEqual(
      expect.objectContaining({
        enabled: true,
        queryKey: ['files', 'project-1', 7],
      }),
    );
    expect(mocks.loadProjectFiles).toHaveBeenCalledWith('project-1', 7);
  });

  it('uses the selected document version instead of the active project version', async () => {
    renderHook(() => useProjectFiles('project-1', { documentVersion: 2 }));

    const options = mocks.useQuery.mock.calls[0]?.[0] as UseQueryOptions;
    await options.queryFn();

    expect(mocks.useProjectRouteVersion).toHaveBeenCalled();
    expect(options).toEqual(
      expect.objectContaining({
        enabled: true,
        queryKey: ['files', 'project-1', 2],
      }),
    );
    expect(mocks.loadProjectFiles).toHaveBeenCalledWith('project-1', 2);
  });

  it('resolves a single file from the project-scoped files query', () => {
    mocks.useQuery.mockReturnValue({
      data: [
        { id: 'file-1', filename: 'one.pdf' },
        { id: 'file-2', filename: 'two.pdf' },
      ],
      isError: false,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useProjectFile({ projectId: 'project-1', fileId: 'file-2' }),
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: ['files', 'project-1', 7],
      }),
    );
    expect(result.current).toEqual({
      file: { id: 'file-2', filename: 'two.pdf' },
      isError: false,
      isLoading: false,
    });
  });
});
