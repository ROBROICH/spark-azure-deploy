import {
  generateDownloadUrlV2FilesFileIdGenerateDownloadUrlGet,
  type FileDownloadResponse,
} from '@/api-clients/dms-module';
import {
  exportArgumentsProjectIdArgumentsExportGet,
  type FileIdResponse,
} from '@/api-clients/oms-module';
import { safeDownloadUrl } from '@/features/shared/remote-files/downloadUrlSafety';

type ClientResult<TData> = {
  data?: TData;
  error?: unknown;
};

const hasStringDetail = (value: unknown): value is { detail: string } =>
  typeof value === 'object' &&
  value !== null &&
  'detail' in value &&
  typeof value.detail === 'string';

const hasMessage = (value: unknown): value is { message: string } =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof value.message === 'string';

const getExportErrorMessage = (error: unknown, fallback: string) => {
  if (hasStringDetail(error)) {
    return error.detail;
  }

  if (hasMessage(error)) {
    return error.message;
  }

  return fallback;
};

/**
 * Creates an Erwiderung CSV through OMS and resolves the DMS download URL for
 * the generated file.
 */
export const exportErwiderungen = async (
  projectId: string,
  projectVersion: number,
): Promise<string> => {
  const exportResponse = (await exportArgumentsProjectIdArgumentsExportGet({
    path: {
      project_id: projectId,
    },
  })) as ClientResult<FileIdResponse>;
  const { data: exportedFile, error: exportError } = exportResponse;

  if (exportError) {
    throw new Error(
      getExportErrorMessage(exportError, 'Erwiderung export request failed.'),
    );
  }

  if (!exportedFile) {
    throw new Error('Erwiderung export response is empty.');
  }

  const downloadUrlResponse =
    (await generateDownloadUrlV2FilesFileIdGenerateDownloadUrlGet({
      path: {
        file_id: exportedFile.file_id,
      },
      query: {
        project_version: projectVersion,
        inline: false,
      },
    })) as ClientResult<FileDownloadResponse>;
  const { data: downloadTarget, error: downloadUrlError } = downloadUrlResponse;

  if (downloadUrlError) {
    throw new Error(
      getExportErrorMessage(
        downloadUrlError,
        'Erwiderung export download URL request failed.',
      ),
    );
  }

  if (!downloadTarget) {
    throw new Error('Erwiderung export download URL response is empty.');
  }

  return safeDownloadUrl(downloadTarget.downloadUrl);
};

export const triggerErwiderungExportDownload = (downloadUrl: string) => {
  const safeUrl = safeDownloadUrl(downloadUrl);
  const link = document.createElement('a');
  link.href = safeUrl;
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  link.click();
};
