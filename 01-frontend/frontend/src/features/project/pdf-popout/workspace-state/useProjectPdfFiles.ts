import { getNodesByType as getNodesByTypeFromGraph } from '@/db/nodes/examinationGraphModel';
import { useProjectFiles } from '@/features/project/data/project-files/useProjectFiles';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { getRouteApi } from '@tanstack/react-router';
import { buildPdfFileTree, type ProjectPdfFile } from '../pdfPopout.logic';

const route = getRouteApi('/verfahren/$verfahrenId');

const normalizeProjectPath = (path: string) => path.replace(/^\/+/, '');

const toProjectPdfFile = (params: { id: string; filename: string }) => {
  const { id, filename } = params;
  const path = normalizeProjectPath(filename);
  const title = path.split('/').pop() || path;

  return {
    id,
    path,
    title,
  } satisfies ProjectPdfFile;
};

const isActiveDokument = (dokument: {
  dmsFileId?: string | null;
  filename?: string | null;
  isDeleted?: boolean;
  isOutdated?: boolean;
}) =>
  Boolean(dokument.dmsFileId && dokument.filename) &&
  !dokument.isDeleted &&
  !dokument.isOutdated;

const toActiveDokumentPdfFiles = (
  dokumente: {
    dmsFileId?: string | null;
    filename?: string | null;
    isDeleted?: boolean;
    isOutdated?: boolean;
  }[],
) => {
  const seenFileIds = new Set<string>();
  const files: ProjectPdfFile[] = [];

  for (const dokument of dokumente) {
    if (
      !isActiveDokument(dokument) ||
      !dokument.dmsFileId ||
      !dokument.filename ||
      seenFileIds.has(dokument.dmsFileId)
    ) {
      continue;
    }

    seenFileIds.add(dokument.dmsFileId);
    const file = toProjectPdfFile({
      id: dokument.dmsFileId,
      filename: dokument.filename,
    });
    if (file.path.length > 0) {
      files.push(file);
    }
  }

  return files;
};

/**
 * Provides PDF tree and preview metadata for the shared popout workspace.
 *
 * The tree prefers dokument nodes from the active project graph so MVP/RPB/FVP
 * all see the same nodes-backed folder structure, while project-file metadata
 * remains the fallback source for preview flags and non-project surfaces.
 */
export const useProjectPdfFiles = (options: { enabled?: boolean } = {}) => {
  const enabled = options.enabled ?? true;
  const { verfahrenId } = route.useParams();
  const { index } = useGraph();
  const dokumentRefs = !enabled
    ? []
    : getNodesByTypeFromGraph(index, 'dokument').map((summary) => ({
        id: summary.id,
        nodeType: summary.nodeType,
      }));
  // useLiveNodes (non-suspending) keeps the provider from suspending when enabled flips true on a file-tree / popout click, which would otherwise tear the project tree back to the route-level ProjectRouteSkeleton fallback.
  const { data: dokumente = [], isLoading: isDokumenteLoading } =
    useLiveNodes(dokumentRefs);
  const {
    files: projectFiles,
    isLoading: isProjectFilesLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useProjectFiles(verfahrenId, {
    enabled: enabled && !isDokumenteLoading && dokumente.length === 0,
  });
  const isLoading = isDokumenteLoading || isProjectFilesLoading;

  const pdfFiles = (() => {
    if (dokumente.length > 0) {
      return toActiveDokumentPdfFiles(dokumente);
    }

    return projectFiles
      .map((file) =>
        toProjectPdfFile({
          id: file.id,
          filename: file.filename,
        }),
      )
      .filter((file) => file.path.length > 0);
  })();

  const tree = buildPdfFileTree(pdfFiles);

  const previewById = (() => {
    const projectFileById = new Map(
      projectFiles.map((file) => [file.id, file]),
    );

    return new Map(
      pdfFiles.map((file) => {
        const projectFile = projectFileById.get(file.id);
        const isPdf = projectFile
          ? projectFile.mimeType === 'application/pdf' ||
            projectFile.filename.toLowerCase().endsWith('.pdf')
          : file.title.toLowerCase().endsWith('.pdf');

        return [file.id, { title: file.title, isPdf }];
      }),
    );
  })();

  return {
    files: pdfFiles,
    tree,
    isLoading,
    isError,
    previewById,
    filePagination:
      dokumente.length === 0 && hasNextPage
        ? { isLoading: isFetchingNextPage, onLoadMore: fetchNextPage }
        : undefined,
  };
};
