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
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});

describe('collectMvpFeedbackPreloadRefs', () => {
  it('preloads directly attached feedback for loaded fundstellen only', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'fundstelle-1', node_type: 'fundstelle' }),
      createSummary({ id: 'fundstelle-2', node_type: 'fundstelle' }),
      createSummary({
        id: 'feedback-1',
        node_type: 'feedback',
        frontend_parent_ids: ['fundstelle:fundstelle-1'],
      }),
      createSummary({
        id: 'feedback-2',
        node_type: 'feedback',
        frontend_parent_ids: ['fundstelle:fundstelle-2'],
      }),
    ]);

    const refs = collectMvpFeedbackPreloadRefs(index, [
      { id: 'fundstelle-1', node_type: 'fundstelle' },
      { id: 'fundstelle-1', node_type: 'fundstelle' },
    ]);
    const compositeKeys = refs.map((ref) => `${ref.node_type}:${ref.id}`);

    expect(compositeKeys).toEqual(['feedback:feedback-1']);
  });
});

describe('collectMvpTopicDetailPreloadRefs', () => {
  it('preloads only first-paint topic, document, and topic_norm refs', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'topic-norm-1',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'selected-norm',
        node_type: 'norm',
        frontend_parent_ids: [
          toCompositeKey({ id: 'topic-norm-1', node_type: 'topic_norm' }),
        ],
      }),
      createSummary({
        id: 'law-1',
        node_type: 'gesetz',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      }),
      createSummary({
        id: 'unrelated-law-norm',
        node_type: 'norm',
        parents: [{ id: 'law-1', node_type: 'gesetz' }],
      }),
      createSummary({
        id: 'document-1',
        node_type: 'dokument',
        frontend_parent_ids: [
          toCompositeKey({ id: 'topic-1', node_type: 'topic' }),
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
      createSummary({ id: 'document-1', node_type: 'dokument' }),
      createSummary({ id: 'norm-1', node_type: 'norm' }),
      createSummary({
        id: 'document-only',
        node_type: 'fundstelle',
        frontend_parent_ids: ['dokument:document-1'],
      }),
      createSummary({
        id: 'norm-only',
        node_type: 'fundstelle',
        frontend_parent_ids: ['norm:norm-1'],
      }),
      createSummary({
        id: 'intersection',
        node_type: 'fundstelle',
        frontend_parent_ids: ['dokument:document-1', 'norm:norm-1'],
      }),
      createSummary({ id: 'feedback-target', node_type: 'fundstelle' }),
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
