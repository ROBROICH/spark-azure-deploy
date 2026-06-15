import { isNodeTypeLiteral } from './nodeTypeLabels';
import type { NodeRef } from './types';

const SEPARATOR = ':';

export type CompositeKey = string & { [Symbol.species]: 'CompositeKey' };

export function toCompositeKey(ref: NodeRef): CompositeKey;
export function toCompositeKey(refs: NodeRef[]): CompositeKey[];
export function toCompositeKey(
  input: NodeRef | NodeRef[],
): CompositeKey | CompositeKey[] {
  const toKey = (ref: NodeRef) =>
    `${ref.node_type}${SEPARATOR}${ref.id}` as CompositeKey;
  if (Array.isArray(input)) {
    return input.map(toKey);
  }
  return toKey(input);
}

export function fromCompositeKey(compositeKey: string): NodeRef {
  const separatorIndex = compositeKey.indexOf(SEPARATOR);

  if (separatorIndex <= 0 || separatorIndex === compositeKey.length - 1) {
    throw new Error(`Invalid composite node key: ${compositeKey}`);
  }

  const node_type = compositeKey.slice(0, separatorIndex);
  const id = compositeKey.slice(separatorIndex + 1);

  if (!isNodeTypeLiteral(node_type)) {
    throw new Error(`Unknown composite node type: ${node_type}`);
  }

  return {
    node_type,
    id,
  };
}

export function tryFromCompositeKey(compositeKey: string): NodeRef | null {
  try {
    return fromCompositeKey(compositeKey);
  } catch {
    return null;
  }
}
