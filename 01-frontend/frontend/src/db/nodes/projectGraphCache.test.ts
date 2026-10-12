import { describe, expect, it } from 'vitest';
import {
  ensureProjectGraphReady,
  getCachedOrBuildProjectGraph,
} from './projectGraphCache';
import type { NodeRef, NodeSummary } from './types';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  isOutdated: false,
  parents: [],
  ...overrides,
});

const createRef = (id: string, nodeType: NodeRef['nodeType']): NodeRef => ({
  id,
  nodeType,
});

const createCollectionKey = () => ({});

describe('projectGraphCache', () => {
  it('returns the same node index for the same summaries array', () => {
    const collectionKey = createCollectionKey();
    const summaries = [createSummary({ id: 'topic-1', nodeType: 'topic' })];

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, summaries);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, summaries);

    expect(secondIndex).toBe(firstIndex);
  });

  it('returns the same node index for a new array with the same summary refs', () => {
    const collectionKey = createCollectionKey();
    const summary = createSummary({ id: 'topic-1', nodeType: 'topic' });

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [summary]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [summary]);

    expect(secondIndex).toBe(firstIndex);
  });

  it('returns the same node index for new objects with the same structure', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [createRef('topic-1', 'topic')],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [createRef('topic-1', 'topic')],
      }),
    ]);

    expect(secondIndex).toBe(firstIndex);
  });

  it('returns the same node index when summaries are reordered without structural changes', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [createRef('topic-1', 'topic'), createRef('topic-2', 'topic')],
        frontendParentIds: ['topic:topic-2', 'topic:topic-1'],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [createRef('topic-2', 'topic'), createRef('topic-1', 'topic')],
        frontendParentIds: ['topic:topic-1', 'topic:topic-2'],
      }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
    ]);

    expect(secondIndex).toBe(firstIndex);
  });

  it('rebuilds when frontend_parent_ids change', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'document-1',
        nodeType: 'dokument',
        frontendParentIds: ['topic:topic-1'],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'document-1',
        nodeType: 'dokument',
        frontendParentIds: ['topic:topic-2'],
      }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when parents change', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [createRef('topic-1', 'topic')],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [createRef('topic-2', 'topic')],
      }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when nodeType changes', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'node-1', nodeType: 'topic' }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'node-1', nodeType: 'topic_norm' }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when outdated changes', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({
        id: 'fundstelle-1',
        nodeType: 'fundstelle',
        isOutdated: false,
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({
        id: 'fundstelle-1',
        nodeType: 'fundstelle',
        isOutdated: true,
      }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
    expect(secondIndex.nodeById.get('fundstelle-1')?.isOutdated).toBe(true);
  });

  it('rebuilds when a node is added', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when a node is removed', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('reuses the same in-flight node index build for concurrent callers', async () => {
    const collectionKey = createCollectionKey();
    const summaries = [createSummary({ id: 'topic-1', nodeType: 'topic' })];
    let resolveSummaries!: (value: NodeSummary[]) => void;
    let resolveCallCount = 0;

    const resolveIndex = () =>
      ensureProjectGraphReady(
        collectionKey,
        () =>
          new Promise<NodeSummary[]>((resolve) => {
            resolveCallCount += 1;
            resolveSummaries = resolve;
          }),
      );

    const firstPromise = resolveIndex();
    const secondPromise = resolveIndex();

    resolveSummaries(summaries);

    const [firstIndex, secondIndex] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);

    expect(resolveCallCount).toBe(1);
    expect(secondIndex).toBe(firstIndex);
  });
});
