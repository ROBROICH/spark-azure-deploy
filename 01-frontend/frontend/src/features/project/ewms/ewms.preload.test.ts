import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  collectEwmsPreloadRefs,
  collectEwmsRoutePreloadRefs,
} from './ewms.preload';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});

describe('collectEwmsPreloadRefs', () => {
  it('preloads the node payload types needed by the EWMS workspace', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'subtopic-1',
        node_type: 'subtopic',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-2',
        node_type: 'subtopic',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        node_type: 'argument',
        parents: [{ id: 'subtopic-1', node_type: 'subtopic' }],
      }),
      createSummary({
        id: 'entry-1',
        node_type: 'beteiligungs_eingang',
      }),
      createSummary({
        id: 'document-1',
        node_type: 'dokument',
      }),
    ]);

    expect(collectEwmsPreloadRefs(index)).toEqual([
      { id: 'topic-1', node_type: 'topic' },
      { id: 'subtopic-1', node_type: 'subtopic' },
      { id: 'subtopic-2', node_type: 'subtopic' },
      { id: 'entry-1', node_type: 'beteiligungs_eingang' },
      { id: 'argument-1', node_type: 'argument' },
    ]);
  });

  it('adds cold-load URL selection refs that may not be present in graph summaries', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'entry-1',
        node_type: 'beteiligungs_eingang',
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
      { id: 'topic-1', node_type: 'topic' },
      { id: 'entry-1', node_type: 'beteiligungs_eingang' },
      { id: 'argument-deep-link', node_type: 'argument' },
      { id: 'topic-deep-link', node_type: 'topic' },
      { id: 'subtopic-deep-link', node_type: 'subtopic' },
      { id: 'expanded-topic-deep-link', node_type: 'topic' },
    ]);
  });
});
