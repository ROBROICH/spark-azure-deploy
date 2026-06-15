import { useLiveSuspenseQuery, type QueryBuilder } from '@tanstack/react-db';
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

type UseNodeResult<T extends NodeRef> = {
  collection: unknown;
  data: NodeQueryResult<T> | null;
  state: unknown;
};

type UseNodesResult<T extends NodeRef> = {
  collection: unknown;
  data: NodeQueryResult<T>[];
  state: unknown;
};

export function useNode<T extends NodeRef>(
  nodeRef: OptionalNodeRef<T>,
): UseNodeResult<T> {
  const { db } = route.useLoaderData();
  const { deps, query } = createNodeQuery(db.payloadsCollection, nodeRef);
  const compositeKeys = useNodePayloadSubsetKeys([nodeRef]);

  const { data, collection, state } = useLiveSuspenseQuery(query, [...deps]);
  const subset = selectNodePayload<T>(data, compositeKeys);

  return {
    collection,
    state,
    data: subset[0] ?? null,
  };
}

export function useNodes<T extends NodeRef>(
  nodeRefs: ReadonlyArray<OptionalNodeRef<T>>,
  queryModifier?: (q: QueryBuilder<any>) => QueryBuilder<any>,
): UseNodesResult<T> {
  const { db } = route.useLoaderData();
  const { deps, query } = createNodesQuery(
    db.payloadsCollection,
    nodeRefs,
    queryModifier,
  );
  const compositeKeys = useNodePayloadSubsetKeys(nodeRefs);

  const { data, collection, state } = useLiveSuspenseQuery(query, [...deps]);
  const subset = selectNodePayload<T>(data, compositeKeys, {
    preservePayloadOrder: Boolean(queryModifier),
  });

  return {
    collection,
    state,
    data: subset,
  };
}
