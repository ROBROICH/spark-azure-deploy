import {
  v1DocumentManagementConfirmFileUpload as confirmFileUpload,
  v1DocumentManagementGenerateFileUploadUrl as generateFileUploadUrl,
  v1DocumentManagementStartFileProcessing as startFileProcessing,
} from '@/api-clients/backend/sdk.gen';
import {
  StorageUploadError,
  uploadFileToStorage,
} from '@/features/shared/remote-files/uploadFileToStorage';
import { useState } from 'react';
import { useInvalidateUploadCaches } from './useInvalidateUploadCaches';

export type UploadZipFailureStage =
  | 'generate-url'
  | 'storage-put'
  | 'confirm'
  | 'start-processing';

export type UploadZipResult =
  | { kind: 'success'; zipFileId: string }
  | {
      kind: 'error';
      stage: UploadZipFailureStage;
      error: unknown;
      httpStatus?: number;
    };

type UseZipUploadResult = {
  isUploading: boolean;
  uploadZip: (file: File, projectId: string) => Promise<UploadZipResult>;
};

type SdkCallResult = {
  error?: unknown;
  response?: { status: number };
};

const toSdkErrorResult = (
  stage: UploadZipFailureStage,
  call: SdkCallResult,
): UploadZipResult => ({
  kind: 'error',
  stage,
  error: call.error,
  httpStatus: call.response?.status,
});

/**
 * Manages the upload lifecycle for a single ZIP file as a new document version.
 * Returns a discriminated result so callers can react to which stage failed.
 *
 * @returns Upload state and the uploadZip function.
 */
export const useZipUpload = (): UseZipUploadResult => {
  const { invalidateForWorkflowTransition } = useInvalidateUploadCaches();
  // eslint-disable-next-line no-restricted-syntax -- in-flight upload status is local interaction state and should not be URL-backed.
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Executes the full upload handshake for a single ZIP file as a new document version.
   *
   * @param file ZIP file selected by the user.
   * @param projectId Owning project of the upload.
   * @returns A discriminated `UploadZipResult` whose `error` variant identifies the failing stage.
   */
  const uploadZip = async (
    file: File,
    projectId: string,
  ): Promise<UploadZipResult> => {
    setIsUploading(true);

    let stage: UploadZipFailureStage = 'generate-url';
    return Promise.resolve()
      .then(async (): Promise<UploadZipResult> => {
        const urlResult = await generateFileUploadUrl({
          body: {
            type: 'zip',
            projectId,
            filename: file.name,
            createNewVersion: true,
          },
        });

        if (!urlResult.data) {
          return toSdkErrorResult(stage, urlResult);
        }

        stage = 'storage-put';
        await uploadFileToStorage({
          file,
          mimeType: urlResult.data.mimeType,
          uploadUrl: urlResult.data.uploadUrl,
        });

        stage = 'confirm';
        const confirmResult = await confirmFileUpload({
          body: { type: 'zip', projectId, filename: file.name },
        });

        if (!confirmResult.data) {
          return toSdkErrorResult(stage, confirmResult);
        }

        stage = 'start-processing';
        const startResult = await startFileProcessing({
          body: { fileId: confirmResult.data.id, projectId },
        });

        if (startResult.error) {
          return toSdkErrorResult(stage, startResult);
        }

        await invalidateForWorkflowTransition(projectId);

        return { kind: 'success', zipFileId: confirmResult.data.id };
      })
      .catch((error): UploadZipResult => {
        return {
          kind: 'error',
          stage,
          error,
          httpStatus:
            error instanceof StorageUploadError ? error.status : undefined,
        };
      })
      .finally(() => {
        setIsUploading(false);
      });
  };

  return { isUploading, uploadZip };
};
