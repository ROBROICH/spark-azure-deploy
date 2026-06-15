import { generateDownloadUrlV2FilesFileIdGenerateDownloadUrlGetOptions } from '@/api-clients/dms-module/@tanstack/react-query.gen';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { toSafeDownloadUrl } from '@/features/shared/remote-files/downloadUrlSafety';
import { useQuery } from '@tanstack/react-query';

const DOWNLOAD_URL_EXPIRY_MS = 4 * 60 * 60 * 1000;
const DOWNLOAD_URL_CACHE_SAFETY_OFFSET_MS = 10 * 1000;
const DOWNLOAD_URL_CACHE_TIME_MS =
  DOWNLOAD_URL_EXPIRY_MS - DOWNLOAD_URL_CACHE_SAFETY_OFFSET_MS;

type UseFileDownloadUrlOptions = {
  projectVersion?: number;
};

/**
 * Resolves a DMS signed download URL for a project file and exposes it only
 * after the returned remote URL passes the frontend download-origin allowlist.
 */
export const useFileDownloadUrl = (
  fileId: string | null | undefined,
  options?: UseFileDownloadUrlOptions,
) => {
  const routeProjectVersion = useProjectRouteVersion();
  const projectVersion = options?.projectVersion ?? routeProjectVersion;
  const query = useQuery({
    ...generateDownloadUrlV2FilesFileIdGenerateDownloadUrlGetOptions({
      path: {
        file_id: fileId ?? '',
      },
      query: {
        project_version: projectVersion,
        inline: true,
      },
    }),
    enabled: Boolean(fileId),
    staleTime: DOWNLOAD_URL_CACHE_TIME_MS,
    gcTime: DOWNLOAD_URL_CACHE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const rawDownloadUrl = query.data?.downloadUrl;
  const downloadUrl = toSafeDownloadUrl(rawDownloadUrl);
  const hasUnsafeDownloadUrl = Boolean(rawDownloadUrl) && !downloadUrl;

  return {
    downloadUrl,
    isLoading: query.isLoading,
    isError: query.isError || hasUnsafeDownloadUrl,
  };
};
