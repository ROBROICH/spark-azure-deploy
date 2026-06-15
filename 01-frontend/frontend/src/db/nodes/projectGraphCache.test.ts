import { describe, expect, it } from 'vitest';
import {
  ensureProjectGraphReady,
  getCachedOrBuildProjectGraph,
} from './projectGraphCache';
import type { NodeRef, NodeSummary } from './types';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  is_outdated: false,
  parents: [],
  ...overrides,
});

const createRef = (id: string, node_type: NodeRef['node_type']): NodeRef => ({
  id,
  node_type,
});

const createCollectionKey = () => ({});

describe('projectGraphCache', () => {
  it('returns the same node index for the same summaries array', () => {
    const collectionKey = createCollectionKey();
    const summaries = [createSummary({ id: 'topic-1', node_type: 'topic' })];

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, summaries);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, summaries);

    expect(secondIndex).toBe(firstIndex);
  });

  it('returns the same node index for a new array with the same summary refs', () => {
    const collectionKey = createCollectionKey();
    const summary = createSummary({ id: 'topic-1', node_type: 'topic' });

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [summary]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [summary]);

    expect(secondIndex).toBe(firstIndex);
  });

  it('returns the same node index for new objects with the same structure', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'norm-1',
        node_type: 'topic_norm',
        parents: [createRef('topic-1', 'topic')],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'norm-1',
        node_type: 'topic_norm',
        parents: [createRef('topic-1', 'topic')],
      }),
    ]);

    expect(secondIndex).toBe(firstIndex);
  });

  it('returns the same node index when summaries are reordered without structural changes', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
      createSummary({
        id: 'norm-1',
        node_type: 'topic_norm',
        parents: [createRef('topic-1', 'topic'), createRef('topic-2', 'topic')],
        frontend_parent_ids: ['topic:topic-2', 'topic:topic-1'],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({
        id: 'norm-1',
        node_type: 'topic_norm',
        parents: [createRef('topic-2', 'topic'), createRef('topic-1', 'topic')],
        frontend_parent_ids: ['topic:topic-1', 'topic:topic-2'],
      }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
      createSummary({ id: 'topic-1', node_type: 'topic' }),
    ]);

    expect(secondIndex).toBe(firstIndex);
  });

  it('rebuilds when frontend_parent_ids change', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'document-1',
        node_type: 'dokument',
        frontend_parent_ids: ['topic:topic-1'],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'document-1',
        node_type: 'dokument',
        frontend_parent_ids: ['topic:topic-2'],
      }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when parents change', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
      createSummary({
        id: 'norm-1',
        node_type: 'topic_norm',
        parents: [createRef('topic-1', 'topic')],
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
      createSummary({
        id: 'norm-1',
        node_type: 'topic_norm',
        parents: [createRef('topic-2', 'topic')],
      }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when node_type changes', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'node-1', node_type: 'topic' }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'node-1', node_type: 'topic_norm' }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when outdated changes', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({
        id: 'fundstelle-1',
        node_type: 'fundstelle',
        is_outdated: false,
      }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({
        id: 'fundstelle-1',
        node_type: 'fundstelle',
        is_outdated: true,
      }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
    expect(secondIndex.nodeById.get('fundstelle-1')?.is_outdated).toBe(true);
  });

  it('rebuilds when a node is added', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('rebuilds when a node is removed', () => {
    const collectionKey = createCollectionKey();

    const firstIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
    ]);
    const secondIndex = getCachedOrBuildProjectGraph(collectionKey, [
      createSummary({ id: 'topic-1', node_type: 'topic' }),
    ]);

    expect(secondIndex).not.toBe(firstIndex);
  });

  it('reuses the same in-flight node index build for concurrent callers', async () => {
    const collectionKey = createCollectionKey();
    const summaries = [createSummary({ id: 'topic-1', node_type: 'topic' })];
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
