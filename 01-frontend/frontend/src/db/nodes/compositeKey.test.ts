import { describe, expect, it } from 'vitest';
import {
  fromCompositeKey,
  toCompositeKey,
  tryFromCompositeKey,
} from './compositeKey';

describe('composite keys', () => {
  it('round-trips validated node refs', () => {
    const key = toCompositeKey({ id: 'topic-1', node_type: 'topic' });

    expect(fromCompositeKey(key)).toEqual({
      id: 'topic-1',
      node_type: 'topic',
    });
  });

  it('rejects unknown node types instead of returning a broad cast', () => {
    expect(() => fromCompositeKey('unknown:node-1')).toThrow(
      'Unknown composite node type: unknown',
    );
    expect(tryFromCompositeKey('unknown:node-1')).toBeNull();
  });

  it('rejects malformed keys', () => {
    expect(() => fromCompositeKey('topic')).toThrow(
      'Invalid composite node key: topic',
    );
    expect(tryFromCompositeKey('topic')).toBeNull();
  });
});
