const MS_PER_MINUTE = 60_000;
const MS_PER_FILE_SIZE_BLOCK = 5 * MS_PER_MINUTE;
const BYTES_PER_MEB = 1024 * 1024;
const BYTES_PER_FILE_SIZE_BLOCK = 20 * BYTES_PER_MEB;

export const MAX_PDF_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export const estimateDurationFromFileSize = (fileSizeBytes: number) => {
  const safeFileSizeBytes = Number.isFinite(fileSizeBytes)
    ? Math.max(0, fileSizeBytes)
    : 0;
  const blockCount = Math.max(
    1,
    Math.ceil(safeFileSizeBytes / BYTES_PER_FILE_SIZE_BLOCK),
  );

  return blockCount * MS_PER_FILE_SIZE_BLOCK;
};

export const getRedactedFilename = (props: {
  filename: string;
  redactedFilenameSuffix: string;
}) => {
  const { filename, redactedFilenameSuffix } = props;
  const trimmedFilename = filename.trim();
  const baseName = trimmedFilename.replace(/\.pdf$/i, '') || 'document';

  return `${baseName}${redactedFilenameSuffix}.pdf`;
};

export const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
