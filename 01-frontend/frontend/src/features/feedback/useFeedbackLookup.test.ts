import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import { getFeedbackRefsForTarget } from './useFeedbackLookup';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});

describe('getFeedbackRefsForTarget', () => {
  it('returns only feedback directly attached to the target node', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'bewertung-1', node_type: 'bewertung' }),
      createSummary({
        id: 'quelle-1',
        node_type: 'bewertung_quelle',
        parents: [{ id: 'bewertung-1', node_type: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-bewertung',
        node_type: 'feedback',
        frontend_parent_ids: ['bewertung:bewertung-1'],
      }),
      createSummary({
        id: 'feedback-quelle',
        node_type: 'feedback',
        frontend_parent_ids: ['bewertung_quelle:quelle-1'],
      }),
    ]);

    expect(
      getFeedbackRefsForTarget(index, {
        id: 'bewertung-1',
        node_type: 'bewertung',
      }).map((ref) => ref.id),
    ).toEqual(['feedback-bewertung']);
    expect(
      getFeedbackRefsForTarget(index, {
        id: 'quelle-1',
        node_type: 'bewertung_quelle',
      }).map((ref) => ref.id),
    ).toEqual(['feedback-quelle']);
  });
});
