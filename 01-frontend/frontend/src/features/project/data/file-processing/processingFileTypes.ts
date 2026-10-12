import type { ZipFileResponse } from '@/api-clients/backend';

export type ProcessingFileType = Extract<
  ZipFileResponse['type'],
  'ewms_zip' | 'zip'
>;

export const PROJECT_DOCUMENT_PROCESSING_FILE_TYPES = ['zip'] as const;

type ProcessingFileLike = Pick<ZipFileResponse, 'type'>;

export const filterProcessingFilesByType = <TFile extends ProcessingFileLike>(
  files: ReadonlyArray<TFile>,
  fileTypes: ReadonlyArray<ProcessingFileType>,
) => {
  const allowedTypes = new Set<ZipFileResponse['type']>(fileTypes);

  return files.filter((file) => allowedTypes.has(file.type));
};
