const FALLBACK_PDF_FILENAME = 'beschluss.pdf';
const FALLBACK_DOCX_FILENAME = 'beschluss.docx';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const resolveDownloadFilename = (
  contentDisposition: string | null,
  fallbackFilename: string,
) => {
  if (!contentDisposition) {
    return fallbackFilename;
  }

  const encodedFilenameMatch = contentDisposition.match(
    /filename\*=UTF-8''([^;]+)/i,
  );
  if (encodedFilenameMatch?.[1]) {
    return decodeURIComponent(encodedFilenameMatch[1]);
  }

  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }

  return fallbackFilename;
};

export const downloadFinalizedProcedureBlob = (
  blob: Blob,
  contentDisposition: string | null,
  format: 'pdf' | 'docx',
) => {
  downloadBlob(
    blob,
    resolveDownloadFilename(
      contentDisposition,
      format === 'pdf' ? FALLBACK_PDF_FILENAME : FALLBACK_DOCX_FILENAME,
    ),
  );
};
