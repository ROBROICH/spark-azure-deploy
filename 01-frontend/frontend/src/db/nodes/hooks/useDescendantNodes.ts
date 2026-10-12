import type {
  NodePayloadByType,
  NodeRef,
  NodeTypeLiteral,
} from '@/db/nodes/types';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNodes } from '@/db/nodes/hooks/useNodes';

export function useDescendantNodes<T extends NodeTypeLiteral>(
  nodeType: T,
  startRef: NodeRef | null | undefined,
) {
  const descendantRefs = useDescendants(nodeType, startRef);

  return useNodes(descendantRefs);
}

/**
 * Returns the single descendant node of `startRef` whose type matches `nodeType`
 * AND for which `predicate` returns true. Returns `undefined` when none match.
 *
 * If multiple candidates satisfy the predicate the first one is returned and a
 * warning is logged in development — predicates are expected to narrow to 0 or 1.
 *
 * The result is reactive: it updates whenever the underlying node payloads change.
 *
 * @example
 * ```ts
 * const dokument = useDescendant(
 *   'dokument',
 *   topicRef,
 *   (n) => n.document_type === 'notice',
 * );
 * ```
 */
export function useDescendantNode<T extends NodeTypeLiteral>(
  nodeType: T,
  startRef: NodeRef | null | undefined,
  predicate: (node: NodePayloadByType<T>) => boolean,
): NodePayloadByType<T> | undefined {
  const { data } = useDescendantNodes(nodeType, startRef);

  const matches = (data as NodePayloadByType<T>[]).filter(predicate);

  if (import.meta.env.DEV && matches.length > 1) {
    throw new Error(
      `[useDescendant] predicate matched ${matches.length} '${nodeType}' descendants of ${startRef?.nodeType ?? 'unknown'}:${startRef?.id ?? 'null'}; expected 0 or 1.`,
    );
  }

  return matches[0];
}
