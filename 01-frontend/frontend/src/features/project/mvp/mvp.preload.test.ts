import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  collectMvpFeedbackPreloadRefs,
  collectMvpTopicDetailPreloadRefs,
  getSearchScopedFundstelleRefs,
  getSearchScopedTopicDetailRefs,
} from './mvp.preload';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  parents: [],
  ...overrides,
});

describe('collectMvpFeedbackPreloadRefs', () => {
  it('preloads directly attached feedback for loaded fundstellen only', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'fundstelle-1', nodeType: 'fundstelle' }),
      createSummary({ id: 'fundstelle-2', nodeType: 'fundstelle' }),
      createSummary({
        id: 'feedback-1',
        nodeType: 'feedback',
        frontendParentIds: ['fundstelle:fundstelle-1'],
      }),
      createSummary({
        id: 'feedback-2',
        nodeType: 'feedback',
        frontendParentIds: ['fundstelle:fundstelle-2'],
      }),
    ]);

    const refs = collectMvpFeedbackPreloadRefs(index, [
      { id: 'fundstelle-1', nodeType: 'fundstelle' },
      { id: 'fundstelle-1', nodeType: 'fundstelle' },
    ]);
    const compositeKeys = refs.map((ref) => `${ref.nodeType}:${ref.id}`);

    expect(compositeKeys).toEqual(['feedback:feedback-1']);
  });
});

describe('collectMvpTopicDetailPreloadRefs', () => {
  it('preloads only first-paint topic, document, and topic_norm refs', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'topic-norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'selected-norm',
        nodeType: 'norm',
        frontendParentIds: [
          toCompositeKey({ id: 'topic-norm-1', nodeType: 'topic_norm' }),
        ],
      }),
      createSummary({
        id: 'law-1',
        nodeType: 'gesetz',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'unrelated-law-norm',
        nodeType: 'norm',
        parents: [{ id: 'law-1', nodeType: 'gesetz' }],
      }),
      createSummary({
        id: 'document-1',
        nodeType: 'dokument',
        frontendParentIds: [
          toCompositeKey({ id: 'topic-1', nodeType: 'topic' }),
        ],
      }),
    ]);

    const compositeKeys = collectMvpTopicDetailPreloadRefs(
      index,
      'topic-1',
    ).map((ref) => toCompositeKey(ref));

    expect(compositeKeys).toEqual([
      'topic:topic-1',
      'topic_norm:topic-norm-1',
      'dokument:document-1',
    ]);
  });
});

describe('getSearchScopedTopicDetailRefs', () => {
  it('adds route-scoped document, norm, detail document, and feedback refs', () => {
    expect(
      getSearchScopedTopicDetailRefs('topic-1', {
        previewDocumentId: 'preview-doc-1',
        selectedDocumentId: 'selected-doc-1',
        selectedNormId: 'selected-norm-1',
        detailDocumentId: 'topic-norm-1',
        feedbackTargetId: 'fundstelle-1',
        feedbackTargetType: 'fundstelle',
      }).map((ref) => toCompositeKey(ref)),
    ).toEqual([
      'topic:topic-1',
      'dokument:preview-doc-1',
      'dokument:selected-doc-1',
      'norm:selected-norm-1',
      'topic_norm:topic-norm-1',
    ]);
  });
});

describe('getSearchScopedFundstelleRefs', () => {
  it('preloads document-only, norm-only, intersection, and feedback target fundstellen', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'document-1', nodeType: 'dokument' }),
      createSummary({ id: 'norm-1', nodeType: 'norm' }),
      createSummary({
        id: 'document-only',
        nodeType: 'fundstelle',
        frontendParentIds: ['dokument:document-1'],
      }),
      createSummary({
        id: 'norm-only',
        nodeType: 'fundstelle',
        frontendParentIds: ['norm:norm-1'],
      }),
      createSummary({
        id: 'intersection',
        nodeType: 'fundstelle',
        frontendParentIds: ['dokument:document-1', 'norm:norm-1'],
      }),
      createSummary({ id: 'feedback-target', nodeType: 'fundstelle' }),
    ]);

    expect(
      getSearchScopedFundstelleRefs(index, {
        selectedDocumentId: 'document-1',
      }).map((ref) => toCompositeKey(ref)),
    ).toEqual(['fundstelle:document-only', 'fundstelle:intersection']);
    expect(
      getSearchScopedFundstelleRefs(index, {
        selectedNormId: 'norm-1',
      }).map((ref) => toCompositeKey(ref)),
    ).toEqual(['fundstelle:norm-only', 'fundstelle:intersection']);
    expect(
      getSearchScopedFundstelleRefs(index, {
        selectedDocumentId: 'document-1',
        selectedNormId: 'norm-1',
      }).map((ref) => toCompositeKey(ref)),
    ).toEqual(['fundstelle:intersection']);
    expect(
      getSearchScopedFundstelleRefs(index, {
        feedbackTargetId: 'feedback-target',
        feedbackTargetType: 'fundstelle',
      }).map((ref) => toCompositeKey(ref)),
    ).toEqual(['fundstelle:feedback-target']);
  });
});
