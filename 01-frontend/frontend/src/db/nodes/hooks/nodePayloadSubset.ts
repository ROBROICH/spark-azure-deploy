import { useMemo } from 'react';
import { toCompositeKey, type CompositeKey } from '../compositeKey';
import type { NodePayloadCollectionItem, NodeRef } from '../types';
import {
  createCompositeKeysDependency,
  type NodeQueryResult,
  type OptionalNodeRef,
} from '../nodeQueryBuilder';

export const isConcreteNodeRef = <T extends NodeRef>(
  nodeRef: OptionalNodeRef<T>,
): nodeRef is T =>
  nodeRef !== null && nodeRef !== undefined && nodeRef.id !== '';

export const createNodePayloadSubsetKeys = <T extends NodeRef>(
  nodeRefs: ReadonlyArray<OptionalNodeRef<T>>,
) => {
  return toCompositeKey(nodeRefs.filter(isConcreteNodeRef));
};

export const useNodePayloadSubsetKeys = <T extends NodeRef>(
  nodeRefs: ReadonlyArray<OptionalNodeRef<T>>,
) => {
  const keys = createNodePayloadSubsetKeys(nodeRefs);
  const dependency = createCompositeKeysDependency(keys, { sort: false });
  // eslint-disable-next-line no-restricted-syntax, react-hooks/exhaustive-deps -- node queries need a stable key array while the composite-key dependency that represents the concrete refs is unchanged.
  return useMemo(() => keys, [dependency]);
};

export const selectNodePayloadSubset = <T extends NodeRef>(
  payloads: ReadonlyArray<NodePayloadCollectionItem>,
  compositeKeys: ReadonlyArray<CompositeKey>,
  options: { preservePayloadOrder?: boolean } = {},
) => {
  const requestedKeys = new Set(compositeKeys);
  const payloadsByKey = new Map<CompositeKey, NodePayloadCollectionItem>();

  for (const payload of payloads) {
    if (requestedKeys.has(payload.compositeKey)) {
      payloadsByKey.set(payload.compositeKey, payload);
    }
  }

  if (options.preservePayloadOrder) {
    return payloads.filter((payload) =>
      requestedKeys.has(payload.compositeKey),
    ) as NodeQueryResult<T>[];
  }

  return compositeKeys.flatMap((compositeKey) => {
    const payload = payloadsByKey.get(compositeKey);

    return payload ? [payload as NodeQueryResult<T>] : [];
  });
};

const toNodePayloadArray = <T extends NodeRef>(payload: unknown) => {
  if (payload === null || payload === undefined) {
    return [];
  }

  return Array.isArray(payload)
    ? (payload as NodeQueryResult<T>[])
    : ([payload] as NodeQueryResult<T>[]);
};

export const selectNodePayload = <T extends NodeRef>(
  payload: unknown,
  compositeKeys: ReadonlyArray<CompositeKey>,
  options: { preservePayloadOrder?: boolean } = {},
) =>
  selectNodePayloadSubset<T>(
    toNodePayloadArray<T>(payload),
    compositeKeys,
    options,
  );
