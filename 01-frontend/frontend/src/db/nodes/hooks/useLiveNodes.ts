import { useLiveQuery, type QueryBuilder } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import type { NodeRef } from '../types';
import {
  createNodeQuery,
  createNodesQuery,
  type NodeQueryResult,
  type OptionalNodeRef,
} from '../nodeQueryBuilder';
import {
  selectNodePayload,
  useNodePayloadSubsetKeys,
} from './nodePayloadSubset';

const route = getRouteApi('/verfahren/$verfahrenId');

type UseLiveNodeResult<T extends NodeRef> = {
  collection: unknown;
  data: NodeQueryResult<T> | null;
  isCleanedUp: boolean;
  isEnabled: boolean;
  isError: boolean;
  isIdle: boolean;
  isLoading: boolean;
  isReady: boolean;
  state: unknown;
  status: unknown;
};

type UseLiveNodesResult<T extends NodeRef> = Omit<
  UseLiveNodeResult<T>,
  'data'
> & {
  data: NodeQueryResult<T>[];
};

export function useLiveNode<T extends NodeRef>(
  nodeRef: OptionalNodeRef<T>,
): UseLiveNodeResult<T> {
  const { db } = route.useLoaderData();
  const { deps, query } = createNodeQuery(db.payloadsCollection, nodeRef);
  const result = useLiveQuery(query, [...deps]);
  const compositeKeys = useNodePayloadSubsetKeys([nodeRef]);
  const data = selectNodePayload<T>(result.data, compositeKeys).at(0) ?? null;

  return {
    ...result,
    data,
    isLoading: compositeKeys.length > 0 && result.isLoading,
  };
}

export function useLiveNodes<T extends NodeRef>(
  nodeRefs: ReadonlyArray<OptionalNodeRef<T>>,
  queryModifier?: (q: QueryBuilder<any>) => QueryBuilder<any>,
): UseLiveNodesResult<T> {
  const { db } = route.useLoaderData();
  const { deps, query } = createNodesQuery(
    db.payloadsCollection,
    nodeRefs,
    queryModifier,
  );
  const result = useLiveQuery(query, [...deps]);
  const compositeKeys = useNodePayloadSubsetKeys(nodeRefs);
  const data = selectNodePayload<T>(result.data, compositeKeys, {
    preservePayloadOrder: Boolean(queryModifier),
  });

  return {
    ...result,
    data,
    isLoading: compositeKeys.length > 0 && result.isLoading,
  };
}
