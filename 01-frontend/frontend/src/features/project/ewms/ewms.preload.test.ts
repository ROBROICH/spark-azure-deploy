import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  collectEwmsPreloadRefs,
  collectEwmsRoutePreloadRefs,
} from './ewms.preload';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  parents: [],
  ...overrides,
});

describe('collectEwmsPreloadRefs', () => {
  it('preloads the node payload types needed by the EWMS workspace', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'subtopic-1',
        nodeType: 'subtopic',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-2',
        nodeType: 'subtopic',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        nodeType: 'argument',
        parents: [{ id: 'subtopic-1', nodeType: 'subtopic' }],
      }),
      createSummary({
        id: 'entry-1',
        nodeType: 'beteiligungs_eingang',
      }),
      createSummary({
        id: 'document-1',
        nodeType: 'dokument',
      }),
    ]);

    expect(collectEwmsPreloadRefs(index)).toEqual([
      { id: 'topic-1', nodeType: 'topic' },
      { id: 'subtopic-1', nodeType: 'subtopic' },
      { id: 'subtopic-2', nodeType: 'subtopic' },
      { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
      { id: 'argument-1', nodeType: 'argument' },
    ]);
  });

  it('adds cold-load URL selection refs that may not be present in graph summaries', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'entry-1',
        nodeType: 'beteiligungs_eingang',
      }),
    ]);

    expect(
      collectEwmsRoutePreloadRefs(index, {
        objectionsFilter: undefined,
        objectionsSort: 'nameAsc',
        selectedArgumentId: 'argument-deep-link',
        selectedObjectionId: 'entry-1',
        selectedTopicId: 'topic-deep-link',
        selectedSubtopicId: 'subtopic-deep-link',
        expandedTopicGroupId: 'expanded-topic-deep-link',
      }),
    ).toEqual([
      { id: 'topic-1', nodeType: 'topic' },
      { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
      { id: 'argument-deep-link', nodeType: 'argument' },
      { id: 'topic-deep-link', nodeType: 'topic' },
      { id: 'subtopic-deep-link', nodeType: 'subtopic' },
      { id: 'expanded-topic-deep-link', nodeType: 'topic' },
    ]);
  });
});
