import {
  listFilesV2FilesGet,
  type FileResponse,
} from '@/api-clients/dms-module';

const EWMS_DOCUMENTS_PAGE_SIZE = 50;

export type EwmsDocument = {
  id: string;
  projectId: string;
  file: FileResponse;
};

/**
 * Recursively loads EWMS document pages until DMS returns a short or empty page.
 */
const loadEwmsDocumentsPage = async (
  projectId: string,
  projectVersion: number,
  page: number,
  allFiles: FileResponse[],
): Promise<FileResponse[]> => {
  const { data } = await listFilesV2FilesGet({
    query: {
      file_type: 'ewms_document',
      projectId,
      project_version: projectVersion,
      page,
      page_size: EWMS_DOCUMENTS_PAGE_SIZE,
    },
    throwOnError: true,
  });

  if (data.length === 0) {
    return allFiles;
  }

  const nextFiles = [...allFiles, ...data];
  if (data.length < EWMS_DOCUMENTS_PAGE_SIZE) {
    return nextFiles;
  }

  return loadEwmsDocumentsPage(projectId, projectVersion, page + 1, nextFiles);
};

const mapEwmsDocument = (
  file: FileResponse,
  projectId: string,
): EwmsDocument => ({
  id: file.id,
  projectId,
  file,
});

export const loadEwmsDocuments = async (
  projectId: string,
  projectVersion: number,
): Promise<EwmsDocument[]> => {
  const files = await loadEwmsDocumentsPage(projectId, projectVersion, 1, []);

  return files.map((file) => mapEwmsDocument(file, projectId));
};
