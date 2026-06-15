import { useFileDownloadUrl } from './useFileDownloadUrl';
import { useProjectFile } from './useProjectFiles';

type UseProjectFilePreviewParams = {
  documentVersion?: number;
  projectId: string;
  fileId: string | null | undefined;
  fallbackTitle: string;
};

const getPreviewTitle = (
  filename: string | null | undefined,
  fallbackTitle: string,
) => {
  if (!filename) {
    return fallbackTitle;
  }

  const normalizedFilename = filename.endsWith('/')
    ? filename.slice(0, -1)
    : filename;
  const filenameSegments = normalizedFilename.split('/');

  return filenameSegments[filenameSegments.length - 1] || fallbackTitle;
};

export const useProjectFilePreview = (props: UseProjectFilePreviewParams) => {
  const { documentVersion, projectId, fileId, fallbackTitle } = props;
  const {
    file,
    isLoading: isFileLoading,
    isError: isFileError,
  } = useProjectFile({
    documentVersion,
    projectId,
    fileId,
  });

  // Only request a signed download URL after we have confirmed the file
  // belongs to the active project. Without this gate, any caller-supplied
  // `fileId` (e.g. a previewDocumentId pasted into the URL bar) would trigger
  // a signed-URL request for a file the user may not be authorized to see.
  const isFileResolved = Boolean(fileId) && !isFileLoading;
  const isFileNotFound = isFileResolved && !isFileError && !file;
  const downloadEligibleFileId = isFileResolved && file ? fileId : null;

  const {
    downloadUrl,
    isLoading: isDownloadUrlLoading,
    isError: isDownloadUrlError,
  } = useFileDownloadUrl(downloadEligibleFileId, {
    projectVersion: documentVersion,
  });

  return {
    title: getPreviewTitle(file?.filename, fallbackTitle),
    downloadUrl,
    isLoading: isFileLoading || isDownloadUrlLoading,
    isError: isFileError || isDownloadUrlError,
    isFileNotFound,
  };
};
