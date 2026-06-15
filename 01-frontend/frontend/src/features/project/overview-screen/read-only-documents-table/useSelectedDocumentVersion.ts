import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/verfahren/$verfahrenId/');

const isValidSelectedVersion = (
  documentVersion: number | undefined,
  latestVersion: number,
) => {
  return (
    documentVersion !== undefined &&
    Number.isInteger(documentVersion) &&
    documentVersion > 0 &&
    documentVersion <= latestVersion
  );
};

export const useSelectedDocumentVersion = () => {
  const documentVersion = route.useSearch({
    select: (search) => search.documentVersion,
  });
  const latestVersion = useProjectRouteVersion();
  const selectedDocumentVersion = isValidSelectedVersion(
    documentVersion,
    latestVersion,
  )
    ? documentVersion
    : latestVersion;

  return {
    latestVersion,
    selectedDocumentVersion,
  };
};
