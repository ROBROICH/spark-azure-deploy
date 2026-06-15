import { getNode } from '@/db/nodes/examinationGraphModel';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import type { ProjectNodeIndex } from '@/db/nodes/projectNodeIndex';
import type { NodePayloadByType } from '@/db/nodes/types';
import { createFundstellenDedupeKeyById } from './mvpFundstellenCardModels';

const resolveFundstelleChunkIds = (
  index: ProjectNodeIndex,
  fundstelle: NodePayloadByType<'fundstelle'>,
) => {
  return Array.from(
    new Set(
      fundstelle.chunk_ids.flatMap((chunkId) => {
        const node = getNode(index, chunkId);

        if (node?.node_type === 'chunk') {
          return [chunkId];
        }

        const parentChunkId = node?.parents.find(
          (parent) => parent.node_type === 'chunk',
        )?.id;

        return parentChunkId ? [parentChunkId] : [];
      }),
    ),
  );
};

const createFundstellenChunkRefs = (
  index: ProjectNodeIndex,
  fundstellen: NodePayloadByType<'fundstelle'>[],
) => {
  const chunkIdsByFundstelleId = new Map<string, string[]>();

  for (const fundstelle of fundstellen) {
    const chunkIds = resolveFundstelleChunkIds(index, fundstelle);

    chunkIdsByFundstelleId.set(fundstelle.id, chunkIds);
  }

  return { chunkIdsByFundstelleId };
};

export const useFundstellenDedupeKeys = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
) => {
  const { index } = useGraph();
  const chunkRefs = createFundstellenChunkRefs(index, fundstellen);
  const dedupeKeyByFundstelleId = createFundstellenDedupeKeyById(
    fundstellen,
    chunkRefs.chunkIdsByFundstelleId,
  );

  return { dedupeKeyByFundstelleId };
};
