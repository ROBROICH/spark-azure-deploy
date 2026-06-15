import {
  assertAllowedHttpsUrl,
  getConfiguredAllowedHttpsOrigins,
} from '@/features/shared/remote-files/remoteUrlSafety';

export type SafeDownloadUrlString = string & {
  readonly __safeDownloadUrl: unique symbol;
};

export type LocalPdfPreviewUrlString = string & {
  readonly __localPdfPreviewUrl: unique symbol;
};

const ALLOWED_DOWNLOAD_ORIGINS_ENV = 'VITE_ALLOWED_DOWNLOAD_ORIGINS';

const getAllowedDownloadOrigins = () =>
  getConfiguredAllowedHttpsOrigins(
    {
      envName: ALLOWED_DOWNLOAD_ORIGINS_ENV,
      runtimeValue: window.__APP_CONFIG__?.VITE_ALLOWED_DOWNLOAD_ORIGINS,
      envValue: import.meta.env.VITE_ALLOWED_DOWNLOAD_ORIGINS,
    },
    {
      allowLocalHttp: import.meta.env.DEV,
    },
  );

export const safeDownloadUrl = (rawUrl: string): SafeDownloadUrlString => {
  return assertAllowedHttpsUrl(
    rawUrl,
    getAllowedDownloadOrigins(),
    {
      invalidUrl: 'Blocked invalid download URL',
      untrustedUrl: 'Blocked untrusted download URL',
    },
    {
      allowLocalHttp: import.meta.env.DEV,
    },
  ) as SafeDownloadUrlString;
};

export const toSafeDownloadUrl = (
  rawUrl: string | null | undefined,
): SafeDownloadUrlString | undefined => {
  if (!rawUrl) {
    return undefined;
  }

  try {
    return safeDownloadUrl(rawUrl);
  } catch {
    return undefined;
  }
};

export const toSafePdfIframeSrc = (
  rawUrl: string | null | undefined,
  pageNumber?: number,
): SafeDownloadUrlString | undefined => {
  const safeUrl = toSafeDownloadUrl(rawUrl);
  if (!safeUrl || pageNumber === undefined) {
    return safeUrl;
  }

  const url = new URL(safeUrl);
  const safePageNumber = Number.isFinite(pageNumber)
    ? Math.max(Math.floor(pageNumber), 1)
    : 1;
  url.hash = `page=${safePageNumber}`;

  return url.toString() as SafeDownloadUrlString;
};

export const createLocalPdfPreviewUrl = (
  blob: Blob,
): LocalPdfPreviewUrlString =>
  URL.createObjectURL(blob) as LocalPdfPreviewUrlString;

export const revokeLocalPdfPreviewUrl = (url: LocalPdfPreviewUrlString) => {
  URL.revokeObjectURL(url);
};
