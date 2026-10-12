import { describe, expect, it } from 'vitest';
import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import {
  collectRpbFeedbackPreloadRefs,
  collectRpbPreloadRefs,
} from './rpb.preload';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  parents: [],
  ...overrides,
});

describe('collectRpbPreloadRefs', () => {
  it('does not preload source feedback as Bewertung feedback', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'bewertung-1', nodeType: 'bewertung' }),
      createSummary({
        id: 'bewertung-quelle-1',
        nodeType: 'bewertung_quelle',
        parents: [{ id: 'bewertung-1', nodeType: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-quelle-1',
        nodeType: 'feedback',
        frontendParentIds: ['bewertung_quelle:bewertung-quelle-1'],
      }),
    ]);

    const refs = collectRpbFeedbackPreloadRefs(index, [
      { id: 'bewertung-1', nodeType: 'bewertung' },
    ]);

    expect(refs).toEqual([]);
  });

  it('preloads outline nodes, topic descendants, and deep-link selections', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({ id: 'outline-1', nodeType: 'vae_node' }),
      createSummary({ id: 'outline-2', nodeType: 'vae_node' }),
      createSummary({
        id: 'topic-norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'norm-1',
        nodeType: 'norm',
        parents: [
          { id: 'topic-norm-1', nodeType: 'topic_norm' },
          { id: 'gesetz-1', nodeType: 'gesetz' },
        ],
      }),
      createSummary({ id: 'gesetz-1', nodeType: 'gesetz' }),
      createSummary({
        id: 'satz-1',
        nodeType: 'satz',
        parents: [{ id: 'absatz-1', nodeType: 'absatz' }],
      }),
      createSummary({
        id: 'absatz-1',
        nodeType: 'absatz',
        parents: [{ id: 'norm-1', nodeType: 'norm' }],
      }),
      createSummary({
        id: 'bewertung-1',
        nodeType: 'bewertung',
        parents: [{ id: 'satz-1', nodeType: 'satz' }],
      }),
      createSummary({
        id: 'bewertung-quelle-1',
        nodeType: 'bewertung_quelle',
        parents: [{ id: 'bewertung-1', nodeType: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-bewertung-1',
        nodeType: 'feedback',
        parents: [{ id: 'bewertung-1', nodeType: 'bewertung' }],
      }),
      createSummary({
        id: 'feedback-quelle-1',
        nodeType: 'feedback',
        parents: [{ id: 'bewertung-quelle-1', nodeType: 'bewertung_quelle' }],
      }),
      createSummary({
        id: 'tbm-1',
        nodeType: 'atomares_tbm',
        parents: [{ id: 'satz-1', nodeType: 'satz' }],
      }),
      createSummary({
        id: 'rechtsfolge-1',
        nodeType: 'rechtsfolge',
        parents: [{ id: 'satz-1', nodeType: 'satz' }],
      }),
      createSummary({
        id: 'ermessensspielraum-1',
        nodeType: 'ermessensspielraum',
        parents: [{ id: 'rechtsfolge-1', nodeType: 'rechtsfolge' }],
      }),
      createSummary({
        id: 'ermessensart-1',
        nodeType: 'ermessensart',
        parents: [{ id: 'rechtsfolge-1', nodeType: 'rechtsfolge' }],
      }),
      createSummary({
        id: 'dokument-1',
        nodeType: 'dokument',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        nodeType: 'argument',
        parents: [
          { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
          { id: 'topic-1', nodeType: 'topic' },
        ],
      }),
      createSummary({
        id: 'argument-2',
        nodeType: 'argument',
        parents: [
          { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
          { id: 'topic-2', nodeType: 'topic' },
        ],
      }),
      createSummary({
        id: 'subtopic-1',
        nodeType: 'subtopic',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-2',
        nodeType: 'subtopic',
        parents: [{ id: 'topic-2', nodeType: 'topic' }],
      }),
      createSummary({ id: 'dokument-2', nodeType: 'dokument' }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      outlineNodeId: 'outline-1',
      previewDocumentId: 'dokument-2',
      satzId: 'satz-1',
      rechtsmethodikSatzId: 'satz-1',
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
    });
    const compositeKeys = refs.map((ref) => `${ref.nodeType}:${ref.id}`).sort();

    expect(compositeKeys).toEqual([
      'absatz:absatz-1',
      'atomares_tbm:tbm-1',
      'bewertung:bewertung-1',
      'bewertung_quelle:bewertung-quelle-1',
      'dokument:dokument-1',
      'dokument:dokument-2',
      'ermessensart:ermessensart-1',
      'ermessensspielraum:ermessensspielraum-1',
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
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'subtopic-1',
        nodeType: 'subtopic',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        nodeType: 'argument',
        parents: [{ id: 'subtopic-1', nodeType: 'subtopic' }],
      }),
      createSummary({
        id: 'argument-2',
        nodeType: 'argument',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      participationSubtopicId: 'subtopic-1',
    });
    const compositeKeys = refs.map((ref) => `${ref.nodeType}:${ref.id}`).sort();

    expect(compositeKeys).toEqual([
      'argument:argument-1',
      'subtopic:subtopic-1',
    ]);
  });

  it('preloads only unassigned argument refs for a Sonstige participation deep link', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({
        id: 'subtopic-1',
        nodeType: 'subtopic',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'argument-1',
        nodeType: 'argument',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'argument-assigned',
        nodeType: 'argument',
        parents: [{ id: 'subtopic-1', nodeType: 'subtopic' }],
      }),
      createSummary({
        id: 'argument-2',
        nodeType: 'argument',
        parents: [{ id: 'topic-2', nodeType: 'topic' }],
      }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      participationSubtopicId: '__sonstige__',
      topicId: 'topic-1',
    });
    const compositeKeys = refs.map((ref) => `${ref.nodeType}:${ref.id}`).sort();

    expect(compositeKeys).toEqual([
      'argument:argument-1',
      'subtopic:subtopic-1',
      'topic:topic-1',
    ]);
  });

  it('preloads selected topic norm descendants when topicId is absent', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'topic-norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'norm-1',
        nodeType: 'norm',
        parents: [{ id: 'topic-norm-1', nodeType: 'topic_norm' }],
      }),
      createSummary({
        id: 'absatz-1',
        nodeType: 'absatz',
        parents: [{ id: 'norm-1', nodeType: 'norm' }],
      }),
      createSummary({
        id: 'satz-1',
        nodeType: 'satz',
        parents: [{ id: 'absatz-1', nodeType: 'absatz' }],
      }),
      createSummary({
        id: 'bewertung-1',
        nodeType: 'bewertung',
        parents: [{ id: 'satz-1', nodeType: 'satz' }],
      }),
      createSummary({
        id: 'feedback-bewertung-1',
        nodeType: 'feedback',
        parents: [{ id: 'bewertung-1', nodeType: 'bewertung' }],
      }),
      createSummary({
        id: 'tbm-1',
        nodeType: 'atomares_tbm',
        parents: [{ id: 'satz-1', nodeType: 'satz' }],
      }),
    ]);

    const refs = collectRpbPreloadRefs(index, {
      topicNormId: 'topic-norm-1',
    });
    const compositeKeys = refs.map((ref) => `${ref.nodeType}:${ref.id}`).sort();

    expect(compositeKeys).toEqual([
      'absatz:absatz-1',
      'norm:norm-1',
      'satz:satz-1',
      'topic_norm:topic-norm-1',
    ]);
  });

  it('does not preload project documents without a topic or preview-document scope', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'outline-1', nodeType: 'vae_node' }),
      createSummary({ id: 'dokument-1', nodeType: 'dokument' }),
    ]);

    const refs = collectRpbPreloadRefs(index, {});
    const compositeKeys = refs.map((ref) => `${ref.nodeType}:${ref.id}`).sort();

    expect(compositeKeys).toEqual(['vae_node:outline-1']);
  });
});
