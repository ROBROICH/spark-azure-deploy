import { describe, expect, it } from 'vitest';
import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import {
  collectRpbFeedbackPreloadRefs,
  collectRpbPreloadRefs,
} from './rpb.preload';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});

describe('collectRpbPreloadRefs', () => {
  it('does not preload source feedback as Bewertung feedback', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'bewertung-1', node_type: 'bewertung' }),
      createSummary({
        id: 'bewertung-quelle-1',
        node_type: 'bewertung_quelle',
        parents: [{ id: 'bewertung-1', node_type: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-quelle-1',
        node_type: 'feedback',
        frontend_parent_ids: ['bewertung_quelle:bewertung-quelle-1'],
      }),
    ]);

    const refs = collectRpbFeedbackPreloadRefs(index, [
      { id: 'bewertung-1', node_type: 'bewertung' },
    ]);

    expect(refs).toEqual([]);
  });

  it('preloads outline nodes, topic descendants, and deep-link selections', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
      createSummary({ id: 'outline-1', node_type: 'vae_node' }),
      createSummary({ id: 'outline-2', node_type: 'vae_node' }),
      createSummary({
        id: 'topic-norm-1',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'norm-1',
        node_type: 'norm',
        parents: [
          { id: 'topic-norm-1', node_type: 'topic_norm' },
          { id: 'gesetz-1', node_type: 'gesetz' },
        ],
      }),
      createSummary({ id: 'gesetz-1', node_type: 'gesetz' }),
      createSummary({
        id: 'satz-1',
        node_type: 'satz',
        parents: [{ id: 'absatz-1', node_type: 'absatz' }],
      }),
      createSummary({
        id: 'absatz-1',
        node_type: 'absatz',
        parents: [{ id: 'norm-1', node_type: 'norm' }],
      }),
      createSummary({
        id: 'bewertung-1',
        node_type: 'bewertung',
        parents: [{ id: 'satz-1', node_type: 'satz' }],
      }),
      createSummary({
        id: 'bewertung-quelle-1',
        node_type: 'bewertung_quelle',
        parents: [{ id: 'bewertung-1', node_type: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-bewertung-1',
        node_type: 'feedback',
        parents: [{ id: 'bewertung-1', node_type: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-quelle-1',
        node_type: 'feedback',
        parents: [{ id: 'bewertung-quelle-1', node_type: 'bewertung_quelle' }],
      }),
      createSummary({
        id: 'tbm-1',
        node_type: 'atomares_tbm',
        parents: [{ id: 'satz-1', node_type: 'satz' }],
      }),
      createSummary({
        id: 'rechtsfolge-1',
        node_type: 'rechtsfolge',
        parents: [{ id: 'satz-1', node_type: 'satz' }],
      }),
      createSummary({
        id: 'dokument-1',
        node_type: 'dokument',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        node_type: 'argument',
        parents: [
          { id: 'entry-1', node_type: 'beteiligungs_eingang' },
          { id: 'topic-1', node_type: 'topic' },
        ],
      }),
      createSummary({
        id: 'argument-2',
        node_type: 'argument',
        parents: [
          { id: 'entry-1', node_type: 'beteiligungs_eingang' },
          { id: 'topic-2', node_type: 'topic' },
        ],
      }),
      createSummary({
        id: 'subtopic-1',
        node_type: 'subtopic',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-2',
        node_type: 'subtopic',
        parents: [{ id: 'topic-2', node_type: 'topic' }],
      }),
      createSummary({ id: 'dokument-2', node_type: 'dokument' }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      outlineNodeId: 'outline-1',
      previewDocumentId: 'dokument-2',
      satzId: 'satz-1',
      rechtsmethodikSatzId: 'satz-1',
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
    });
    const compositeKeys = refs
      .map((ref) => `${ref.node_type}:${ref.id}`)
      .sort();

    expect(compositeKeys).toEqual([
      'absatz:absatz-1',
      'atomares_tbm:tbm-1',
      'bewertung:bewertung-1',
      'bewertung_quelle:bewertung-quelle-1',
      'dokument:dokument-1',
      'dokument:dokument-2',
      'feedback:feedback-bewertung-1',
      'feedback:feedback-quelle-1',
      'gesetz:gesetz-1',
      'norm:norm-1',
      'rechtsfolge:rechtsfolge-1',
      'satz:satz-1',
      'subtopic:subtopic-1',
      'topic:topic-1',
      'topic_norm:topic-norm-1',
      'vae_node:outline-1',
      'vae_node:outline-2',
    ]);
  });

  it('preloads argument descendants for a real participation subtopic deep link', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'subtopic-1',
        node_type: 'subtopic',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        node_type: 'argument',
        parents: [{ id: 'subtopic-1', node_type: 'subtopic' }],
      }),
      createSummary({
        id: 'argument-2',
        node_type: 'argument',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      participationSubtopicId: 'subtopic-1',
    });
    const compositeKeys = refs
      .map((ref) => `${ref.node_type}:${ref.id}`)
      .sort();

    expect(compositeKeys).toEqual([
      'argument:argument-1',
      'subtopic:subtopic-1',
    ]);
  });

  it('preloads only unassigned argument refs for a Sonstige participation deep link', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({ id: 'topic-2', node_type: 'topic' }),
      createSummary({
        id: 'subtopic-1',
        node_type: 'subtopic',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        node_type: 'argument',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'argument-assigned',
        node_type: 'argument',
        parents: [{ id: 'subtopic-1', node_type: 'subtopic' }],
      }),
      createSummary({
        id: 'argument-2',
        node_type: 'argument',
        parents: [{ id: 'topic-2', node_type: 'topic' }],
      }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      participationSubtopicId: '__sonstige__',
      topicId: 'topic-1',
    });
    const compositeKeys = refs
      .map((ref) => `${ref.node_type}:${ref.id}`)
      .sort();

    expect(compositeKeys).toEqual([
      'argument:argument-1',
      'subtopic:subtopic-1',
      'topic:topic-1',
    ]);
  });

  it('preloads selected topic norm descendants when topicId is absent', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'topic-norm-1',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'norm-1',
        node_type: 'norm',
        parents: [{ id: 'topic-norm-1', node_type: 'topic_norm' }],
      }),
      createSummary({
        id: 'absatz-1',
        node_type: 'absatz',
        parents: [{ id: 'norm-1', node_type: 'norm' }],
      }),
      createSummary({
        id: 'satz-1',
        node_type: 'satz',
        parents: [{ id: 'absatz-1', node_type: 'absatz' }],
      }),
      createSummary({
        id: 'bewertung-1',
        node_type: 'bewertung',
        parents: [{ id: 'satz-1', node_type: 'satz' }],
      }),
      createSummary({
        id: 'feedback-bewertung-1',
        node_type: 'feedback',
        parents: [{ id: 'bewertung-1', node_type: 'bewertung' }],
      }),
      createSummary({
        id: 'tbm-1',
        node_type: 'atomares_tbm',
        parents: [{ id: 'satz-1', node_type: 'satz' }],
      }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      topicNormId: 'topic-norm-1',
    });
    const compositeKeys = refs
      .map((ref) => `${ref.node_type}:${ref.id}`)
      .sort();

    expect(compositeKeys).toEqual([
      'absatz:absatz-1',
      'norm:norm-1',
      'satz:satz-1',
      'topic_norm:topic-norm-1',
    ]);
  });

  it('does not preload project documents without a topic or preview-document scope', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'outline-1', node_type: 'vae_node' }),
      createSummary({ id: 'dokument-1', node_type: 'dokument' }),
    ]);

    const refs = collectRpbPreloadRefs(index, {});
    const compositeKeys = refs
      .map((ref) => `${ref.node_type}:${ref.id}`)
      .sort();

    expect(compositeKeys).toEqual(['vae_node:outline-1']);
  });
});
