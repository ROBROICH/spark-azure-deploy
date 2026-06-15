import {
  type Collection,
  inArray,
  type InitialQueryBuilder,
  type Prettify,
  type QueryBuilder,
} from '@tanstack/react-db';
import { toCompositeKey, type CompositeKey } from './compositeKey';
import type { NodePayload, NodePayloadCollectionItem, NodeRef } from './types';

type PayloadsCollection = Collection<
  NodePayloadCollectionItem,
  string | number,
  {}
>;
type CompositeKeysDependencyOptions = {
  sort?: boolean;
};

export type NodeQueryResult<T extends NodeRef> = Prettify<NodePayload & T>;
export type OptionalNodeRef<T extends NodeRef> = T | null | undefined;

const isConcreteNodeRef = <T extends NodeRef>(
  nodeRef: OptionalNodeRef<T>,
): nodeRef is T =>
  nodeRef !== null && nodeRef !== undefined && nodeRef.id !== '';

const toConcreteCompositeKeys = <T extends NodeRef>(
  nodeRefs: ReadonlyArray<OptionalNodeRef<T>>,
): CompositeKey[] => toCompositeKey(nodeRefs.filter(isConcreteNodeRef));

/** Creates a stable dependency token for composite-key subsets. */
export const createCompositeKeysDependency = (
  compositeKeys: ReadonlyArray<CompositeKey>,
  options: CompositeKeysDependencyOptions = {},
) => {
  const normalizedKeys =
    options.sort === false ? [...compositeKeys] : [...compositeKeys].sort();

  return normalizedKeys.join('\u001f');
};

export const createNodeQuery = <T extends NodeRef>(
  payloadsCollection: PayloadsCollection,
  nodeRef: OptionalNodeRef<T>,
) => {
  const compositeKeys = toConcreteCompositeKeys([nodeRef]);
  const compositeKeysDependency = createCompositeKeysDependency(compositeKeys);

  return {
    deps: [payloadsCollection, compositeKeysDependency] as const,
    query: (q: InitialQueryBuilder) =>
      q
        .from({ payloads: payloadsCollection })
        .where(({ payloads }) => inArray(payloads.compositeKey, compositeKeys))
        .findOne(),
  };
};

export const createNodesQuery = <T extends NodeRef>(
  payloadsCollection: PayloadsCollection,
  nodeRefs: ReadonlyArray<OptionalNodeRef<T>>,
  queryModifier?: (q: QueryBuilder<any>) => QueryBuilder<any>,
) => {
  const compositeKeys = toConcreteCompositeKeys(nodeRefs);
  const compositeKeysDependency = createCompositeKeysDependency(compositeKeys);

  return {
    deps: [payloadsCollection, compositeKeysDependency, queryModifier] as const,
    query: (q: InitialQueryBuilder) => {
      let baseQuery = q
        .from({ payloads: payloadsCollection })
        .where(({ payloads }) => inArray(payloads.compositeKey, compositeKeys));

      if (queryModifier) {
        baseQuery = queryModifier(baseQuery);
      }

      return baseQuery;
    },
  };
};
