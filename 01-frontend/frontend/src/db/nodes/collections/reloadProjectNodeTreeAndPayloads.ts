import {
  getNodePayloadsCollection,
  reloadNodePayloadsCollection,
} from './nodePayloads.collection';
import {
  getNodeSummariesCollection,
  reloadNodeSummariesCollection,
} from './nodeSummaries.collection';

export async function reloadProjectNodeTreeAndPayloads(
  projectId: string,
  projectVersion: number,
) {
  await Promise.all([
    reloadNodeSummariesCollection(projectId),
    reloadNodePayloadsCollection(projectId, projectVersion),
  ]);
}

export async function refetchProjectNodeTreeAndPayloads(
  projectId: string,
  projectVersion: number,
) {
  const payloadsCollection = getNodePayloadsCollection(
    projectId,
    projectVersion,
  );
  payloadsCollection.clearLoaderCache();

  await Promise.all([
    getNodeSummariesCollection(projectId, projectVersion).utils.refetch(),
    payloadsCollection.utils.refetch(),
  ]);
}
