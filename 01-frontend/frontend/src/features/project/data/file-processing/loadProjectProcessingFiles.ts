import {
  v1DocumentManagementListZipFiles as listZipFiles,
  type ZipFileResponse,
} from '@/api-clients/backend';

const PROCESSING_FILES_PAGE_SIZE = 50;

/**
 * Loads ZIP uploads for a project so active file-processing workflows can be derived.
 *
 * @param projectId Project whose ZIP uploads should be fetched.
 * @returns All ZIP file records across all pages.
 */
export const loadProjectProcessingFiles = async (
  projectId: string,
  projectVersion: number,
) => {
  const allZipFiles: ZipFileResponse[] = [];
  let page = 1;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- each page number depends on the previous paginated response before the next request can be formed.
    const { data } = await listZipFiles({
      query: {
        projectId,
        projectVersion: projectVersion,
        page,
        pageSize: PROCESSING_FILES_PAGE_SIZE,
      },
      throwOnError: true,
    });
    if (data.length === 0) {
      break;
    }
    allZipFiles.push(...data);
    if (data.length < PROCESSING_FILES_PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return allZipFiles;
};
