import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectPdfFiles } from './useProjectPdfFiles';

type TestDokument = {
  dmsFileId: string;
  filename: string;
  isDeleted?: boolean;
  isOutdated?: boolean;
};

type TestProjectFile = {
  id: string;
  filename: string;
  mimeType: string;
};

const mocks = vi.hoisted(() => ({
  dokumente: [] as TestDokument[],
  projectFiles: [] as TestProjectFile[],
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
  }),
}));

vi.mock('@/db/nodes/examinationGraphModel', () => ({
  getNodesByType: () => [{ id: 'dokument-node', nodeType: 'dokument' }],
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({ index: {} }),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: () => ({ data: mocks.dokumente, isLoading: false }),
}));

vi.mock('@/features/project/data/project-files/useProjectFiles', () => ({
  useProjectFiles: () => ({
    files: mocks.projectFiles,
    isLoading: false,
    isError: false,
  }),
}));

beforeEach(() => {
  mocks.dokumente = [];
  mocks.projectFiles = [];
});

describe('useProjectPdfFiles', () => {
  it('filters inactive dokument nodes and dedupes by DMS file id', () => {
    mocks.dokumente = [
      {
        dmsFileId: 'file-1',
        filename: 'akten/current.pdf',
      },
      {
        dmsFileId: 'file-1',
        filename: 'akten/duplicate.pdf',
      },
      {
        dmsFileId: 'file-2',
        filename: 'akten/deleted.pdf',
        isDeleted: true,
      },
      {
        dmsFileId: 'file-3',
        filename: 'akten/outdated.pdf',
        isOutdated: true,
      },
    ];
    mocks.projectFiles = [
      {
        id: 'fallback-file',
        filename: 'fallback.pdf',
        mimeType: 'application/pdf',
      },
    ];

    const { result } = renderHook(() => useProjectPdfFiles());

    expect(result.current.files).toEqual([
      {
        id: 'file-1',
        path: 'akten/current.pdf',
        title: 'current.pdf',
      },
    ]);
    expect([...result.current.previewById.keys()]).toEqual(['file-1']);
  });
});
