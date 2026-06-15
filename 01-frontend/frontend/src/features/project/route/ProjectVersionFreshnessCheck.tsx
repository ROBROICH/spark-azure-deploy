import { projectsCollection } from '@/features/project/data/collections/projects.collection';
import { emitProjectVersionConflict } from '@/features/project/versioning/conflict-dialogs/projectVersionConflict';
import { getProjectLatestVersion } from '@/features/project/versioning/projectVersioning';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

const PROJECT_VERSION_FRESHNESS_INTERVAL_MS = 300_000;

type ProjectVersionFreshnessCheckProps = {
  loaderProjectVersion: number;
  projectId: string;
};

type ProjectVersionSnapshot = {
  latestVersion: number;
};

export function ProjectVersionFreshnessCheck(
  props: ProjectVersionFreshnessCheckProps,
) {
  const { loaderProjectVersion, projectId } = props;
  const hasEmittedConflict = useRef(false);
  const query = useQuery<ProjectVersionSnapshot>({
    queryKey: ['project-version-freshness', projectId, loaderProjectVersion],
    queryFn: () => projectsCollection.utils.refetchProject(projectId),
    initialData: { latestVersion: loaderProjectVersion },
    refetchInterval: PROJECT_VERSION_FRESHNESS_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: 'always',
    retry: false,
  });

  const latestProjectVersion = getProjectLatestVersion(query.data);

  // eslint-disable-next-line no-restricted-syntax -- Bridges background project freshness checks into the existing global blocking version-conflict dialog.
  useEffect(() => {
    if (hasEmittedConflict.current) {
      return;
    }

    if (latestProjectVersion === loaderProjectVersion) {
      return;
    }

    hasEmittedConflict.current = true;
    emitProjectVersionConflict({ kind: 'not_latest', projectId });
  }, [latestProjectVersion, loaderProjectVersion, projectId]);

  return null;
}
