import {
  safeUploadUrl,
  type SafeUploadUrlString,
} from '@/features/shared/remote-files/uploadUrlSafety';

export class StorageUploadError extends Error {
  status: number;

  constructor(response: Response) {
    super(`Upload failed during storage-put: HTTP ${response.status}`);
    this.name = 'StorageUploadError';
    this.status = response.status;
  }
}

const putFileToUrl = async (params: {
  file: File;
  mimeType: string;
  putUrl: SafeUploadUrlString;
}) =>
  fetch(params.putUrl, {
    method: 'PUT',
    body: params.file,
    headers: { 'Content-Type': params.mimeType },
  });

/**
 * Uploads one browser file to a presigned storage endpoint.
 */
export const uploadFileToStorage = async (params: {
  file: File;
  mimeType: string;
  uploadUrl: string;
}) => {
  const { file, mimeType, uploadUrl } = params;
  const putUrl = safeUploadUrl(uploadUrl);
  const response = await putFileToUrl({
    file,
    mimeType,
    putUrl,
  });

  if (response.ok) {
    return;
  }

  throw new StorageUploadError(response);
};
