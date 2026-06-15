import { getNodePayloadsCollection } from './collections/nodePayloads.collection';
import { getNodeSummariesCollection } from './collections/nodeSummaries.collection';

/**
 * Bundles all db-related objects for one examination project.
 * Returned as `db` from the route loader so consumers destructure `db.*`.
 */
export function createExaminationDb(
  verfahrenId: string,
  projectVersion: number,
) {
  const nodesCollection = getNodeSummariesCollection(
    verfahrenId,
    projectVersion,
  );
  const payloadsCollection = getNodePayloadsCollection(
    verfahrenId,
    projectVersion,
  );

  return { nodesCollection, payloadsCollection };
}

export type ExaminationDb = ReturnType<typeof createExaminationDb>;
