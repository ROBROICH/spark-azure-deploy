import { getDescendantNodeRefsByType } from '../examinationGraphModel';
import { measureGraphPerf } from '../graphPerf';
import type { NodeRef, NodeTypeLiteral } from '../types';
import { useGraph } from './useGraph';

type TypedNodeRef<T extends NodeTypeLiteral> = NodeRef & { node_type: T };

/**
 * Returns all descendant `NodeRef`s of `startRef` whose type matches `nodeType`.
 *
 * The start node itself is excluded from the results.
 * The result is reactive: it updates whenever the underlying node summaries change.
 *
 * @example
 * ```ts
 * const fundstellen = useDescendants('fundstelle', topicRef);
 * ```
 */
export function useDescendants<T extends NodeTypeLiteral>(
  nodeType: T,
  startRef: NodeRef | null | undefined,
): TypedNodeRef<T>[] {
  const { hasNode, index } = useGraph();

  if (!startRef || startRef.id === '' || !hasNode(startRef.id)) {
    return [];
  }

  return measureGraphPerf(
    'useDescendants',
    () => getDescendantNodeRefsByType(index, startRef.id, nodeType),
    {
      nodeType,
      startId: startRef.id,
      startNodeType: startRef.node_type,
    },
  );
}
