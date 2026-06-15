import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useTopicNodes } from '@/db/nodes/hooks/useTopicNodes';

/**
 * Exposes the shared project node index for the graph explorer surfaces.
 */
export const useNodeGraph = () => {
  const graphState = useGraph();
  const { data: topics } = useTopicNodes();

  return {
    ...graphState,
    graph: graphState.index,
    topics,
  };
};
