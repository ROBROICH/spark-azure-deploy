import {
  listFilesV2FilesGet,
  type FileResponse,
} from '@/api-clients/dms-module';

const FILES_PAGE_SIZE = 50;

/**
 * Recursively loads paginated file responses until the DMS API returns a short page or no data.
 *
 * @param projectId Project whose files should be loaded.
 * @param page Current page number.
 * @param allFiles Accumulator for previously fetched pages.
 * @returns The flattened file list across every fetched page.
 */
const loadProjectFilesPage = async (
  projectId: string,
  projectVersion: number,
  page: number,
  allFiles: FileResponse[],
): Promise<FileResponse[]> => {
  const { data } = await listFilesV2FilesGet({
    query: {
      file_type: 'document',
      projectId,
      project_version: projectVersion,
      page,
      page_size: FILES_PAGE_SIZE,
    },
    throwOnError: true,
  });

  if (data.length === 0) {
    return allFiles;
  }

  const nextFiles = [...allFiles, ...data];
  if (data.length < FILES_PAGE_SIZE) {
    return nextFiles;
  }

  return loadProjectFilesPage(projectId, projectVersion, page + 1, nextFiles);
};

export const loadProjectFiles = (projectId: string, projectVersion: number) =>
  loadProjectFilesPage(projectId, projectVersion, 1, []);
