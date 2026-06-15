import { describe, expect, it } from 'vitest';
import type { CompositeKey } from './compositeKey';
import { createCompositeKeysDependency } from './nodeQueryBuilder';

const TOPIC_1 = 'topic:1' as CompositeKey;
const TOPIC_NORM_2 = 'topic_norm:2' as CompositeKey;

describe('createCompositeKeysDependency', () => {
  it('treats reordered key sets as the same dependency by default', () => {
    const firstDependency = createCompositeKeysDependency([
      TOPIC_1,
      TOPIC_NORM_2,
    ]);
    const secondDependency = createCompositeKeysDependency([
      TOPIC_NORM_2,
      TOPIC_1,
    ]);

    expect(secondDependency).toBe(firstDependency);
  });

  it('can preserve order when the caller already owns a stable key order', () => {
    const firstDependency = createCompositeKeysDependency(
      [TOPIC_1, TOPIC_NORM_2],
      { sort: false },
    );
    const secondDependency = createCompositeKeysDependency(
      [TOPIC_NORM_2, TOPIC_1],
      { sort: false },
    );

    expect(secondDependency).not.toBe(firstDependency);
  });
});
