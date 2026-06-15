import { useQuery } from '@tanstack/react-query';

import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { loadProjectFiles } from '../collections/files.collection';

export const useProjectFiles = (
  projectId: string,
  options: { documentVersion?: number; enabled?: boolean } = {},
) => {
  const enabled = options.enabled ?? true;
  const documentVersion = options.documentVersion;
  const routeProjectVersion = useProjectRouteVersion();
  const shouldLoad = enabled && projectId.length > 0;
  const projectVersion = shouldLoad
    ? (documentVersion ?? routeProjectVersion)
    : undefined;

  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['files', projectId, projectVersion],
    queryFn: () => {
      if (projectVersion === undefined) {
        return Promise.resolve([]);
      }
      return loadProjectFiles(projectId, projectVersion);
    },
    enabled: shouldLoad,
  });

  if (!shouldLoad) {
    return {
      files: [],
      isLoading: false,
      isError: false,
    };
  }

  return {
    files: data,
    isLoading,
    isError,
  };
};

type UseProjectFileParams = {
  documentVersion?: number;
  projectId: string;
  fileId: string | null | undefined;
};

export const useProjectFile = (props: UseProjectFileParams) => {
  const { documentVersion, projectId, fileId } = props;
  const { files, isLoading, isError } = useProjectFiles(projectId, {
    documentVersion,
  });

  return {
    file: fileId ? (files.find((entry) => entry.id === fileId) ?? null) : null,
    isLoading,
    isError,
  };
};
