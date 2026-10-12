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
      fundstelle.chunkIds.flatMap((chunkId) => {
        const node = getNode(index, chunkId);

        if (node?.nodeType === 'chunk') {
          return [chunkId];
        }

        const parentChunkId = node?.parents.find(
          (parent) => parent.nodeType === 'chunk',
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
